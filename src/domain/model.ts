import { loadPanelErrors } from "./loadPanel";
import { panelModelErrors, panelAssembly } from "./surfacePanel";
import { slabRings } from "./slabPolygon";
import {
  jointGeometryErrors,
  refreshJoint,
  rigidFloorRows,
  sharedEdges,
} from "./slabJoint";
import { meshSlab } from "./slab";
import {
  normalizeRings,
  polygonError,
  stablePolygonSupports,
  maxSlabVertices,
  maxSlabRings,
} from "./slabPolygon";
import { distributeWind } from "./wind";
import { z } from "zod";
import { generationKey } from "./combinationFamilies";
import {
  geometrySchemas,
  geometryErrors,
  defaultGeometry,
  sectionProperties,
} from "./sections";
import {
  memberStiffnessError,
  stiffnessFactorError,
  stiffnessLabels,
} from "./memberStiffness";
import { memberAxis, offsetError, setOffsets } from "./memberOffsets";
import {
  diaphragmErrors,
  remapDiaphragmNodes,
  diaphragmStability,
} from "./diaphragms";
import { thermalFieldError } from "./thermalLoads";
import { distributedLoadError } from "./memberDistributedLoads";
import { componentError, positionError } from "./memberPointLoads";
import { connectionStations } from "./beamMesh";
import { selectionKey } from "./selection";
import { foundationConstraintRows, globalFoundationMatrix } from "./foundation";
import { hasSpring, supportBasis, supportDofs, supportsDof } from "./supports";
import {
  coordinates,
  cross,
  distance,
  interiorParameter,
  matrixRank as rank,
  subtract,
  origin,
  scale,
  tolerance,
  type Point3,
} from "./geometry";

import { pressureSpecError, slabPressureVertices } from "./surfacePressure";

const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[\w-]+$/)
  .refine((v) => !["__proto__", "constructor", "prototype"].includes(v));
const finite = z.number().finite();
const text = z.string().min(1).max(120);
const flag = z.boolean();
const planarRestraints = z.object({ ux: flag, uz: flag, ry: flag }).strict();
const restraints = planarRestraints.extend({ uy: flag, rx: flag, rz: flag });
const legacyNode = z
  .object({
    id,
    name: text,
    x: finite,
    y: finite,
    z: finite,
    restraints: planarRestraints,
  })
  .strict();
const nodeSchema = legacyNode.extend({ restraints });
const legacyMaterial = z
  .object({
    id,
    name: text,
    E: finite.positive(),
    nu: finite.min(0).lt(0.5),
    density: finite.positive(),
  })
  .strict();
export const materialSchema = legacyMaterial.extend({ alpha: finite });
export const materialLimit = 100;
export const sectionLimit = 100;
const legacySection = z
  .object({
    id,
    name: text,
    materialId: id,
    width: finite.positive(),
    height: finite.positive(),
  })
  .strict();
const legacyMember = z
  .object({ id, name: text, start: id, end: id, sectionId: id })
  .strict();
export const connectionComponentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rigid") }).strict(),
  z.object({ kind: z.literal("free") }).strict(),
  z
    .object({ kind: z.literal("elastic"), stiffness: finite.positive() })
    .strict(),
]);
export const endConnectionSchema = z
  .object({
    ux: connectionComponentSchema,
    uy: connectionComponentSchema,
    uz: connectionComponentSchema,
    rx: connectionComponentSchema,
    ry: connectionComponentSchema,
    rz: connectionComponentSchema,
  })
  .strict();
export type ConnectionComponent = z.infer<typeof connectionComponentSchema>;
export type EndConnection = z.infer<typeof endConnectionSchema>;
const memberSchema = legacyMember.extend({
  roll: finite.min(-360).max(360),
  connectionI: endConnectionSchema.optional(),
  connectionJ: endConnectionSchema.optional(),
});
const legacyNodal = z
  .object({ nodeId: id, fx: finite, fz: finite, my: finite })
  .strict();
const legacyUniform = z
  .object({ memberId: id, qx: finite, qz: finite })
  .strict();
export const patternLoadLimit = 5000;
const legacyPattern = z
  .object({
    id,
    name: text,
    nodal: z.array(legacyNodal).max(patternLoadLimit),
    uniform: z.array(legacyUniform).max(patternLoadLimit),
  })
  .strict();
const patternSchema = legacyPattern.extend({
  nodal: z
    .array(legacyNodal.extend({ fy: finite, mx: finite, mz: finite }))
    .max(patternLoadLimit),
  uniform: z.array(legacyUniform.extend({ qy: finite })).max(patternLoadLimit),
});
const guideSchema = z.object({ id, name: text, position: finite }).strict();
const legacySchema = z
  .object({
    format: z.literal("kstruct"),
    schemaVersion: z.literal(1),
    id,
    name: text,
    units: z.literal("N-m-kg-s"),
    nodes: z.array(legacyNode).max(1000),
    members: z.array(legacyMember).max(1000),
    materials: z.array(legacyMaterial).min(1).max(materialLimit),
    sections: z.array(legacySection).min(1).max(sectionLimit),
    loadPatterns: z.array(legacyPattern).min(1).max(100),
    analysisCases: z
      .array(
        z
          .object({
            id,
            name: text,
            type: z.literal("linear-static"),
            factors: z
              .array(z.object({ patternId: id, factor: finite }).strict())
              .min(1),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    mesh: z
      .object({ segmentsPerMember: z.number().int().min(2).max(32) })
      .strict(),
  })
  .strict();
const spatialSchema = legacySchema.extend({
  schemaVersion: z.literal(2),
  mode: z.enum(["planar", "spatial"]),
  nodes: z.array(nodeSchema).max(1000),
  members: z.array(memberSchema).max(1000),
  loadPatterns: z.array(patternSchema).min(1).max(100),
  guides: z
    .object({
      x: z.array(guideSchema).min(1).max(40),
      y: z.array(guideSchema).min(1).max(40),
      z: z.array(guideSchema).min(1).max(40),
    })
    .strict(),
});
const combinationSchema = spatialSchema.extend({
  schemaVersion: z.literal(3),
  resultCombinations: z
    .array(
      z
        .object({
          id,
          name: text,
          type: z.literal("linear"),
          factors: z
            .array(z.object({ caseId: id, factor: finite }).strict())
            .min(1)
            .max(100),
        })
        .strict(),
    )
    .max(100),
});
const envelopeSchema = combinationSchema.extend({
  schemaVersion: z.literal(4),
  resultEnvelopes: z
    .array(
      z
        .object({ id, name: text, combinationIds: z.array(id).min(1).max(100) })
        .strict(),
    )
    .max(100),
});

export const slabDivisionLimit = 64;
const slabDivisions = z.number().int().min(2).max(slabDivisionLimit);
const slabSchema = z
  .object({
    id,
    name: text,
    levelId: id,
    x: finite,
    y: finite,
    lengthX: finite.positive(),
    lengthY: finite.positive(),
    thickness: finite.positive(),
    materialId: id,
    divisionsX: slabDivisions,
    divisionsY: slabDivisions,
    supports: z
      .object({ xMin: flag, xMax: flag, yMin: flag, yMax: flag })
      .strict(),
  })
  .strict();
const slabPressureSchema = z.object({ slabId: id, pz: finite }).strict();
const triangleProjectV5 = envelopeSchema.extend({
  schemaVersion: z.literal(5),
  slabs: z.array(slabSchema).max(1),
  loadPatterns: z
    .array(
      patternSchema.extend({
        pressure: z.array(slabPressureSchema).max(1),
      }),
    )
    .min(1)
    .max(100),
});

const quadProjectV5 = triangleProjectV5.extend({
  slabs: z
    .array(
      slabSchema
        .omit({ levelId: true, divisionsX: true, divisionsY: true })
        .extend({
          z: finite,
          nx: slabDivisions,
          ny: slabDivisions,
        }),
    )
    .max(1),
  loadPatterns: z
    .array(
      patternSchema.extend({
        pressures: z
          .array(z.object({ slabId: id, qz: finite }).strict())
          .max(1),
      }),
    )
    .min(1)
    .max(100),
});
const projectV6 = triangleProjectV5.extend({
  schemaVersion: z.literal(6),
  // A v5 panel could have a free elevation in addition to 40 named levels.
  guides: spatialSchema.shape.guides.extend({
    z: z.array(guideSchema).min(1).max(41),
  }),
  slabs: z
    .array(slabSchema.extend({ formulation: z.enum(["dkt", "qdkt"]) }))
    .max(1),
});

const objectRef = z
  .object({ kind: z.enum(["node", "member", "slab"]), id })
  .strict();
const selectionGroups = z
  .array(
    z
      .object({
        id,
        name: z.string().trim().min(1).max(120),
        objects: z.array(objectRef).max(2001),
      })
      .strict(),
  )
  .max(100);
const projectV7 = projectV6.extend({
  schemaVersion: z.literal(7),
  selectionGroups,
});

const projectV8 = projectV7.extend({
  schemaVersion: z.literal(8),
  meshConnections: z
    .array(z.object({ memberId: id, nodeId: id }).strict())
    .max(32000),
});

const projectV9 = projectV8.extend({
  schemaVersion: z.literal(9),
  materials: z.array(materialSchema).min(1).max(materialLimit),
});

const sectionIdentity = { id, name: text, materialId: id };
export const sectionSchema = z
  .discriminatedUnion("shape", [
    geometrySchemas.rectangle.extend(sectionIdentity),
    geometrySchemas.circle.extend(sectionIdentity),
    geometrySchemas.tube.extend(sectionIdentity),
    geometrySchemas.i.extend(sectionIdentity),
  ])
  .superRefine((section, ctx) => {
    for (const [field, message] of Object.entries(geometryErrors(section)))
      ctx.addIssue({ code: "custom", path: [field], message });
  });
const projectV10 = projectV9.extend({
  schemaVersion: z.literal(10),
  sections: z.array(sectionSchema).min(1).max(sectionLimit),
});
const directionSchema = z.object({ x: finite, y: finite, z: finite }).strict();
const supportFrameSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("planar"), angle: finite.min(-360).max(360) })
    .strict(),
  z
    .object({
      kind: z.literal("spatial"),
      x: directionSchema,
      y: directionSchema,
    })
    .strict(),
]);
const supportNodeSchema = nodeSchema.extend({
  supportFrame: supportFrameSchema.optional(),
});
const projectV11 = projectV10.extend({
  schemaVersion: z.literal(11),
  nodes: z.array(supportNodeSchema).max(1000),
});
const offsetEnd = z.strictObject({
  eccentricity: directionSchema,
  rigidLength: finite.nonnegative(),
});
const offsetMemberSchema = memberSchema.extend({
  offsets: z.strictObject({ i: offsetEnd, j: offsetEnd }).optional(),
});
const projectV12 = projectV11.extend({
  schemaVersion: z.literal(12),
  members: z
    .array(
      offsetMemberSchema.transform((member) => {
        if (member.offsets) setOffsets(member, member.offsets);
        return member;
      }),
    )
    .max(1000),
});
const stiffnessFactor = finite.positive().optional();
const projectV13 = projectV12.extend({
  schemaVersion: z.literal(13),
  members: z
    .array(
      offsetMemberSchema
        .extend({
          stiffness: z
            .strictObject({
              ea: stiffnessFactor,
              eiy: stiffnessFactor,
              eiz: stiffnessFactor,
              gj: stiffnessFactor,
            })
            .optional(),
        })
        .transform((member) => {
          if (member.offsets) setOffsets(member, member.offsets);
          return member;
        }),
    )
    .max(1000),
});
const spring = finite.nonnegative().optional();
const elasticNodeSchema = supportNodeSchema.extend({
  springs: z
    .strictObject({
      ux: spring,
      uy: spring,
      uz: spring,
      rx: spring,
      ry: spring,
      rz: spring,
    })
    .optional(),
});
const projectV14 = projectV13.extend({
  schemaVersion: z.literal(14),
  nodes: z.array(elasticNodeSchema).max(1000),
});
const projectV15 = projectV14.extend({
  schemaVersion: z.literal(15),
  diaphragms: z
    .array(
      z.strictObject({
        id,
        name: text,
        levelId: id,
        reference: z.strictObject({ x: finite, y: finite }),
        nodeIds: z.array(id).min(2).max(1000),
      }),
    )
    .max(500)
    .optional(),
});
const foundationSchema = z.strictObject({
  name: z.string().min(1).max(255),
  fileName: z.string().min(1).max(255),
  matrix: z.array(z.array(finite).length(6)).length(6),
  freeDofs: z.array(z.enum(supportDofs)).max(6),
  metadata: z.array(z.array(z.string().max(8192)).min(2).max(12)).max(512),
  offset: directionSchema,
  reference: z.enum(["node", "offset"]),
  reflected: z.literal(true).optional(),
});
const projectV16 = projectV15.extend({
  schemaVersion: z.literal(16),
  nodes: z
    .array(
      elasticNodeSchema.extend({ foundation: foundationSchema.optional() }),
    )
    .max(1000),
});
const pointLoadSchema = z.strictObject({
  id,
  memberId: id,
  kind: z.enum(["force", "moment"]),
  system: z.enum(["global", "local"]),
  position: z.strictObject({
    kind: z.enum(["distance", "relative"]),
    value: finite,
  }),
  components: directionSchema,
});
const projectV17 = projectV16.extend({
  schemaVersion: z.literal(17),
  loadPatterns: z
    .array(
      projectV16.shape.loadPatterns.element.extend({
        points: z.array(pointLoadSchema).max(patternLoadLimit).optional(),
      }),
    )
    .min(1)
    .max(100),
});
const distributedSchema = z.strictObject({
  id,
  memberId: id,
  system: pointLoadSchema.shape.system,
  measure: pointLoadSchema.shape.position.shape.kind,
  start: finite,
  end: finite,
  qStart: directionSchema,
  qEnd: directionSchema,
});
const projectV18 = projectV17.extend({
  schemaVersion: z.literal(18),
  loadPatterns: z
    .array(
      projectV17.shape.loadPatterns.element.extend({
        distributed: z
          .array(distributedSchema)
          .max(patternLoadLimit)
          .optional(),
      }),
    )
    .min(1)
    .max(100),
});
const projectV19 = projectV18.extend({
  schemaVersion: z.literal(19),
  loadPatterns: z
    .array(
      projectV18.shape.loadPatterns.element.extend({
        prescribed: z
          .array(
            z.strictObject({
              nodeId: id,
              dof: z.enum(supportDofs),
              value: finite,
            }),
          )
          .max(patternLoadLimit)
          .optional(),
      }),
    )
    .min(1)
    .max(100),
});
const selfWeightSchema = z
  .object({
    enabled: flag,
    direction: z.enum(["+X", "-X", "+Y", "-Y", "+Z", "-Z"]),
    gravity: finite.nonnegative(),
    multiplier: finite.nonnegative(),
  })
  .strict();
const projectV20 = projectV19.extend({
  schemaVersion: z.literal(20),
  loadPatterns: z
    .array(
      projectV19.shape.loadPatterns.element.extend({
        selfWeight: selfWeightSchema,
      }),
    )
    .min(1)
    .max(100),
});
const projectV21 = projectV20.extend({
  schemaVersion: z.literal(21),
  loadPatterns: z
    .array(
      projectV20.shape.loadPatterns.element.extend({
        wind: z
          .array(
            z.strictObject({
              id,
              name: text,
              bottomId: id,
              topId: id,
              angle: finite.min(-360).max(360),
              pressure: finite.nonnegative(),
              coefficient: finite,
              width: finite.positive(),
              from: finite.min(0).max(1),
              to: finite.min(0).max(1),
            }),
          )
          .max(500)
          .optional(),
      }),
    )
    .min(1)
    .max(100),
});
const projectV22 = projectV21.extend({
  schemaVersion: z.literal(22),
  loadPatterns: z
    .array(
      projectV21.shape.loadPatterns.element.extend({
        thermal: z
          .array(
            z.strictObject({
              memberId: id,
              uniform: finite,
              deltaY: finite,
              deltaZ: finite,
            }),
          )
          .max(patternLoadLimit)
          .optional(),
      }),
    )
    .min(1)
    .max(100),
});
const oldCombo = projectV22.shape.resultCombinations.element;
const familyKind = z.enum(["ELU", "ELS"]);
const generatedBy = z.strictObject({
  familyId: id,
  kind: familyKind,
  leadingId: id.nullable(),
  alternatives: z.array(id).max(100),
  source: text,
  suggested: z.strictObject({
    name: text,
    factors: z.array(oldCombo.shape.factors.element).max(100),
  }),
});
const projectV23 = projectV22.extend({
  schemaVersion: z.literal(23),
  combinationProfile: z
    .strictObject({
      actions: z
        .array(
          z.strictObject({
            caseId: id,
            role: z.enum(["permanent", "variable"]),
            group: z.string().max(120),
          }),
        )
        .max(100),
      families: z
        .array(
          z.strictObject({
            id,
            name: text,
            kind: familyKind,
            enabled: flag,
            source: text,
            permanent: finite,
            leading: finite,
            accompanying: finite,
          }),
        )
        .min(1)
        .max(100),
    })
    .optional(),
  resultCombinations: z
    .array(oldCombo.extend({ generation: generatedBy.optional() }))
    .max(100),
});
const rectangleSlab = projectV23.shape.slabs.element.extend({
  polygon: z.undefined().optional(),
});
const polygonSlab = slabSchema
  .pick({
    id: true,
    name: true,
    levelId: true,
    thickness: true,
    materialId: true,
  })
  .extend({
    formulation: z.literal("dkt"),
    polygon: z.strictObject({
      refinements: z.number().int().min(1).max(3),
      rings: z
        .array(
          z
            .array(
              z.strictObject({
                x: finite,
                y: finite,
                edgeId: id,
                supported: flag,
              }),
            )
            .min(3)
            .max(maxSlabVertices),
        )
        .min(1)
        .max(maxSlabRings),
    }),
  });
const projectV24 = projectV23.extend({
  schemaVersion: z.literal(24),
  slabs: z.array(z.union([rectangleSlab, polygonSlab])).max(1),
});
const projectV25 = projectV24.extend({
  schemaVersion: z.literal(25),
});
const sizingSchema = z.strictObject({
  target: finite.positive(),
  edges: z
    .array(z.strictObject({ edgeId: id, size: finite.positive() }))
    .max(maxSlabVertices),
});
const sizedRectangle = rectangleSlab.extend({
  sizing: sizingSchema.optional(),
});
const sizedPolygon = polygonSlab.extend({ sizing: sizingSchema.optional() });
const projectV26 = projectV25.extend({
  schemaVersion: z.literal(26),
  slabs: z.array(z.union([sizedRectangle, sizedPolygon])).max(1),
});
const jointSide = z.strictObject({ slabId: id, edgeId: id });
const slabJointSchema = z
  .strictObject({
    a: jointSide,
    b: jointSide,
    kind: z.enum(["hinged", "elastic", "continuous"]),
    stiffness: finite.positive().optional(),
    support: z.enum(["none", "line", "beam"]),
    memberId: id.optional(),
  })
  .refine(
    (j) =>
      (j.kind === "elastic") === (j.stiffness !== undefined) &&
      (j.support === "beam") === (j.memberId !== undefined),
    "Rigidez ou viga incompatível com a opção da borda.",
  );
const projectV27 = projectV26.extend({
  schemaVersion: z.literal(27),
  slabs: z.array(z.union([sizedRectangle, sizedPolygon])).max(2),
  slabJoint: slabJointSchema.optional(),
  loadPatterns: z
    .array(
      projectV26.shape.loadPatterns.element.extend({
        pressure: z.array(slabPressureSchema).max(2),
      }),
    )
    .min(1)
    .max(100),
});
const panelPoint = z.strictObject({ x: finite, y: finite, z: finite });
const panelEdge = z.enum(["AB", "BC", "CD", "DA"]);
const panelV28 = z.strictObject({
  id,
  name: text,
  kind: z.enum(["membrane", "plate", "shell"]),
  materialId: id,
  a: panelPoint,
  b: panelPoint,
  d: panelPoint,
  thickness: finite.positive(),
  nu: z.number().int().min(1).max(32),
  nv: z.number().int().min(1).max(32),
  fixed: z.array(panelEdge).max(4),
});
const panelAction = z.strictObject({
  panelId: id,
  edge: panelEdge,
  traction: panelPoint,
  pressure: finite,
});
const projectV28 = projectV27.extend({
  schemaVersion: z.literal(28),
  surfacePanels: z.array(panelV28).max(2).optional(),
  loadPatterns: z
    .array(
      projectV27.shape.loadPatterns.element.extend({
        panelActions: z.array(panelAction).max(2).optional(),
      }),
    )
    .min(1)
    .max(100),
});
const panelFactors = z.strictObject({
  n11: finite.positive().optional(),
  n22: finite.positive().optional(),
  n12: finite.positive().optional(),
  m11: finite.positive().optional(),
  m22: finite.positive().optional(),
  m12: finite.positive().optional(),
});
const surfacePanel = panelV28.extend({
  angleDeg: finite.optional(),
  stiffness: panelFactors.optional(),
});
const projectV29 = projectV28.extend({
  schemaVersion: z.literal(29),
  surfacePanels: z.array(surfacePanel).max(2).optional(),
});
const distribution = z.discriminatedUnion("mode", [
  z
    .strictObject({
      mode: z.literal("elevation"),
      z0: finite,
      z1: finite,
      p0: finite,
      p1: finite,
    })
    .refine((d) => d.z1 > d.z0, "A cota superior deve superar a inferior."),
  z.strictObject({
    mode: z.literal("vertices"),
    values: z.record(id, finite).refine((v) => Object.keys(v).length <= 128),
  }),
]);
const areaAttributes = {
  direction: z.enum(["normal", "X", "Y", "Z"]).optional(),
  distribution: distribution.optional(),
};
const spatialAction = panelAction.extend(areaAttributes);
const projectV30 = projectV29.extend({
  schemaVersion: z.literal(30),
  loadPatterns: z
    .array(
      projectV29.shape.loadPatterns.element.extend({
        pressure: z.array(slabPressureSchema.extend(areaAttributes)).max(2),
        panelActions: z.array(spatialAction).max(2).optional(),
      }),
    )
    .min(1)
    .max(100),
});
const loadPanelSchema = z.strictObject({
  id,
  name: text,
  a: id,
  b: id,
  d: id,
  distribution: z.enum(["spanAB", "spanAD", "twoWay"]),
});
const tributaryLoadSchema = z.strictObject({
  panelId: id,
  axis: z.enum(["X", "Y", "Z"]),
  pressure: finite,
});
const projectV31 = projectV30.extend({
  schemaVersion: z.literal(31),
  loadPanels: z.array(loadPanelSchema).max(100).optional(),
  loadPatterns: z
    .array(
      projectV30.shape.loadPatterns.element.extend({
        tributaryLoads: z.array(tributaryLoadSchema).max(100).optional(),
      }),
    )
    .min(1)
    .max(100),
});
const sectionCutSchema = z.strictObject({
  id,
  name: text,
  point: panelPoint,
  normal: panelPoint.refine((v) => {
    const n = Math.hypot(v.x, v.y, v.z);
    return Number.isFinite(n) && n > 0;
  }, "A normal do corte deve ser não nula."),
  retained: z.enum(["negative", "positive"]),
  datum: panelPoint,
});
const projectV32 = z.strictObject({
  ...projectV31.shape,
  schemaVersion: z.literal(32),
  sectionCuts: z.array(sectionCutSchema).max(100).optional(),
});
const serviceSource = z.strictObject({
  kind: z.enum(["case", "combination", "envelope"]),
  id,
});
const serviceBase = { id, name: text, source: serviceSource };
const serviceMeasureSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...serviceBase,
    kind: z.literal("difference"),
    a: id,
    b: id,
    axis: z.enum(coordinates),
  }),
  z.strictObject({
    ...serviceBase,
    kind: z.literal("drift"),
    a: id,
    b: id,
    axis: z.enum(["x", "y"]),
  }),
  z.strictObject({
    ...serviceBase,
    kind: z.literal("chord"),
    memberId: id,
    t: finite.min(0).max(1),
    axis: z.enum(coordinates),
  }),
]);
export const projectSchema = projectV32.extend({
  schemaVersion: z.literal(33),
  serviceMeasures: z.array(serviceMeasureSchema).max(100).optional(),
});
export type ServiceMeasure = z.infer<typeof serviceMeasureSchema>;
export type ServiceSource = z.infer<typeof serviceSource>;
export type SectionCut = z.infer<typeof sectionCutSchema>;
export type LoadPanel = z.infer<typeof loadPanelSchema>;
export type TributaryLoad = z.infer<typeof tributaryLoadSchema>;
export type PressureDistribution = z.infer<typeof distribution>;
export type PressureDirection = NonNullable<
  z.infer<typeof areaAttributes.direction>
>;
export type PanelFactors = z.infer<typeof panelFactors>;
export type SurfacePanel = z.infer<typeof surfacePanel>;
export type PanelAction = z.infer<typeof spatialAction>;
export type PanelEdge = z.infer<typeof panelEdge>;
export type SlabJoint = z.infer<typeof slabJointSchema>;
export type SlabSizing = z.infer<typeof sizingSchema>;
export function defaultSelfWeight() {
  return {
    enabled: false,
    direction: "-Z" as const,
    gravity: 9.80665,
    multiplier: 1,
  };
}

export type Diaphragm = NonNullable<Project["diaphragms"]>[number];
export type Section = z.infer<typeof sectionSchema>;
export type Material = z.infer<typeof materialSchema>;
export const defaultElasticProperties = {
  E: 2e11,
  nu: 0.3,
  density: 7850,
  alpha: 0,
} as const;
export type Project = z.infer<typeof projectSchema>;
export type AnalysisCase = Project["analysisCases"][number];
export type ResultCombination = Project["resultCombinations"][number];
export type ResultEnvelope = Project["resultEnvelopes"][number];
export type StructuralNode = Project["nodes"][number];
export type Member = Project["members"][number];
export type Slab = Project["slabs"][number];
export type RectangleSlab = z.infer<typeof sizedRectangle>;
export type PolygonSlab = z.infer<typeof sizedPolygon>;
export type NodalLoad = Project["loadPatterns"][number]["nodal"][number];
export type UniformLoad = Project["loadPatterns"][number]["uniform"][number];
export type SelectedObject = z.infer<typeof objectRef>;
export type Selection = SelectedObject | null;
export const uid = () => crypto.randomUUID();
export const free = () => ({
  ux: false,
  uy: false,
  uz: false,
  rx: false,
  ry: false,
  rz: false,
});
export const rigidConnectionComponent = () => ({ kind: "rigid" as const });
export const defaultEndConnection = () => ({
  ux: rigidConnectionComponent(),
  uy: rigidConnectionComponent(),
  uz: rigidConnectionComponent(),
  rx: rigidConnectionComponent(),
  ry: rigidConnectionComponent(),
  rz: rigidConnectionComponent(),
});
export const nodalLoad = (nodeId: string): NodalLoad => ({
  nodeId,
  fx: 0,
  fy: 0,
  fz: 0,
  mx: 0,
  my: 0,
  mz: 0,
});
export const uniformLoad = (memberId: string): UniformLoad => ({
  memberId,
  qx: 0,
  qy: 0,
  qz: 0,
});

function defaultGuides(): Project["guides"] {
  const guide = (id: string, name: string, position: number) => ({
    id,
    name,
    position,
  });
  return {
    x: [guide("X1", "1", 0), guide("X2", "2", 4), guide("X3", "3", 8)],
    y: [guide("YA", "A", 0), guide("YB", "B", 4), guide("YC", "C", 8)],
    z: [
      guide("base", "Base", 0),
      guide("level1", "Pav. 1", 3),
      guide("level2", "Pav. 2", 6),
    ],
  };
}

export function createProject(mode: Project["mode"] = "planar"): Project {
  return {
    format: "kstruct",
    schemaVersion: 33,
    meshConnections: [],
    selectionGroups: [],
    id: uid(),
    name: "Projeto sem título",
    units: "N-m-kg-s",
    mode,
    guides: defaultGuides(),
    nodes: [],
    members: [],
    slabs: [],
    materials: [
      { id: "steel", name: "Material M1", ...defaultElasticProperties },
    ],
    sections: [
      {
        id: "rect",
        name: "Retangular R1",
        materialId: "steel",
        ...defaultGeometry.rectangle,
      },
    ],
    loadPatterns: [
      {
        id: "G",
        name: "Carga permanente",
        selfWeight: defaultSelfWeight(),
        nodal: [],
        uniform: [],
        pressure: [],
      },
    ],
    analysisCases: [
      {
        id: "EL",
        name: "EL · Estática linear",
        type: "linear-static",
        factors: [{ patternId: "G", factor: 1 }],
      },
    ],
    resultCombinations: [],
    resultEnvelopes: [],
    mesh: { segmentsPerMember: 8 },
  };
}

export function beamExample(): Project {
  const p = createProject();
  p.name = "Viga biapoiada · 6 m";
  p.nodes = [
    {
      id: "A",
      name: "N1",
      x: 0,
      y: 0,
      z: 0,
      restraints: { ...free(), ux: true, uz: true },
    },
    {
      id: "B",
      name: "N2",
      x: 6,
      y: 0,
      z: 0,
      restraints: { ...free(), uz: true },
    },
  ];
  p.members = [
    { id: "V1", name: "B1", start: "A", end: "B", sectionId: "rect", roll: 0 },
  ];
  p.loadPatterns[0].uniform = [{ ...uniformLoad("V1"), qz: -10000 }];
  return p;
}

export const projectFileLimit = 5_000_000;
function exceedsFileLimit(json: string) {
  return (
    json.length > projectFileLimit ||
    (json.length * 3 > projectFileLimit &&
      new TextEncoder().encode(json).length > projectFileLimit)
  );
}
function normalizeSlabPressureVertices(data: Project) {
  for (const slab of data.slabs)
    if (slab.polygon) {
      const original = slab.polygon.rings,
        normalized = normalizeRings(original);
      for (const [i, ring] of normalized.entries()) {
        if (ring === original[i]) continue;
        for (const pat of data.loadPatterns) {
          const dist = pat.pressure.find(
            (a) => a.slabId === slab.id,
          )?.distribution;
          if (dist?.mode !== "vertices") continue;
          const byPoint = original[i].map((v) => ({
            x: v.x,
            y: v.y,
            value: dist.values[v.edgeId] ?? 0,
          }));
          for (const v of ring)
            dist.values[v.edgeId] = byPoint.find(
              (w) => w.x === v.x && w.y === v.y,
            )!.value;
        }
      }
      slab.polygon.rings = normalized;
    }
}
export function serializeProject(p: Project) {
  const data = projectSchema.parse(p);
  normalizeSlabPressureVertices(data);
  const pretty = JSON.stringify(data, null, 2);
  if (!exceedsFileLimit(pretty)) return pretty;
  const compact = JSON.stringify(data);
  if (exceedsFileLimit(compact))
    throw new Error("O projeto excede o limite de 5 MB.");
  return compact;
}

export function parseProject(source: string): Project {
  if (exceedsFileLimit(source))
    throw new Error("O arquivo excede o limite inicial de 5 MB.");
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("O arquivo não contém um JSON válido.");
  }
  // Preserve explicit object references when a legacy file already includes groups.
  let oldGroups: unknown = [];
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    typeof value.schemaVersion === "number" &&
    value.schemaVersion < 7 &&
    "selectionGroups" in value
  ) {
    const { selectionGroups, ...model } = value;
    oldGroups = selectionGroups;
    value = model;
  }
  const legacy = legacySchema.safeParse(value);
  if (legacy.success) {
    const v1 = legacy.data;
    value = {
      ...v1,
      schemaVersion: 4,
      mode: "planar",
      guides: defaultGuides(),
      resultCombinations: [],
      resultEnvelopes: [],
      nodes: v1.nodes.map((n) => ({
        ...n,
        restraints: { ...free(), ...n.restraints },
      })),
      members: v1.members.map((m) => ({ ...m, roll: 0 })),
      loadPatterns: v1.loadPatterns.map((p) => ({
        ...p,
        nodal: p.nodal.map((l) => ({ ...nodalLoad(l.nodeId), ...l })),
        uniform: p.uniform.map((l) => ({ ...uniformLoad(l.memberId), ...l })),
      })),
    };
  } else if (
    value !== null &&
    typeof value === "object" &&
    "schemaVersion" in value
  ) {
    if (value.schemaVersion === 2) {
      const v2 = spatialSchema.safeParse(value);
      if (v2.success)
        value = {
          ...v2.data,
          schemaVersion: 4,
          resultCombinations: [],
          resultEnvelopes: [],
        };
    } else if (value.schemaVersion === 3) {
      const v3 = combinationSchema.safeParse(value);
      if (v3.success)
        value = { ...v3.data, schemaVersion: 4, resultEnvelopes: [] };
    } else if (value.schemaVersion === 5) {
      const triangle = triangleProjectV5.safeParse(value);
      if (triangle.success) {
        value = {
          ...triangle.data,
          schemaVersion: 6,
          slabs: triangle.data.slabs.map((slab) => ({
            ...slab,
            formulation: "dkt",
          })),
        };
      } else {
        const quad = quadProjectV5.safeParse(value);
        if (quad.success) {
          const { guides, loadPatterns, slabs } = quad.data;
          const panels = slabs.map(({ z, nx, ny, ...slab }) => {
            let level = guides.z.find(
              (item) => Math.abs(item.position - z) < tolerance,
            );
            if (!level) {
              let id = "slab-level";
              while (guides.z.some((item) => item.id === id)) id += "-";
              level = { id, name: "Cota da laje", position: z };
              guides.z.push(level);
            }
            return {
              ...slab,
              levelId: level.id,
              divisionsX: nx,
              divisionsY: ny,
              formulation: "qdkt",
            };
          });
          value = {
            ...quad.data,
            schemaVersion: 6,
            slabs: panels,
            loadPatterns: loadPatterns.map(({ pressures, ...pattern }) => ({
              ...pattern,
              pressure: pressures.map(({ slabId, qz }) => ({ slabId, pz: qz })),
            })),
          };
        }
      }
    }
  }
  const v4 = envelopeSchema.safeParse(value);
  if (v4.success) {
    value = {
      ...v4.data,
      schemaVersion: 6,
      slabs: [],
      loadPatterns: v4.data.loadPatterns.map((pattern) => ({
        ...pattern,
        pressure: [],
      })),
    };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 6
  ) {
    const old = projectV6.safeParse(value);
    if (old.success) {
      const p = old.data;
      const groups = selectionGroups.safeParse(oldGroups);
      if (!groups.success)
        throw new Error("Formato de grupo de seleção inválido.");
      const ids = projectObjectIds(p);
      value = {
        ...p,
        schemaVersion: 7,
        selectionGroups: groups.data.map((g) => ({
          ...g,
          objects: g.objects.filter((o) => ids[o.kind].has(o.id)),
        })),
      };
    }
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 7
  ) {
    const old = projectV7.safeParse(value);
    if (old.success)
      value = { ...old.data, schemaVersion: 8, meshConnections: [] };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 8
  ) {
    const old = projectV8.safeParse(value);
    if (old.success)
      value = {
        ...old.data,
        schemaVersion: 9,
        materials: old.data.materials.map((material) => ({
          ...material,
          alpha: 0,
        })),
      };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 9
  ) {
    const old = projectV9.safeParse(value);
    if (old.success)
      value = {
        ...old.data,
        schemaVersion: 10,
        sections: old.data.sections.map((s) => ({ ...s, shape: "rectangle" })),
      };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 10
  ) {
    const old = projectV10.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 11 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 11
  ) {
    const old = projectV11.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 12 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 12
  ) {
    const old = projectV12.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 13 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 13
  ) {
    const old = projectV13.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 14 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 14
  ) {
    const old = projectV14.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 15 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 15
  ) {
    const old = projectV15.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 16 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 16
  ) {
    const old = projectV16.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 17 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 17
  ) {
    const old = projectV17.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 18 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 18
  ) {
    const old = projectV18.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 19 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 19
  ) {
    const old = projectV19.safeParse(value);
    if (old.success)
      value = {
        ...old.data,
        schemaVersion: 20,
        loadPatterns: old.data.loadPatterns.map((p) => ({
          ...p,
          selfWeight: defaultSelfWeight(),
        })),
      };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 20
  ) {
    const old = projectV20.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 21 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 21
  ) {
    const old = projectV21.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 22 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 22
  ) {
    const old = projectV22.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 23 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 23
  ) {
    const old = projectV23.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 24 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 24
  ) {
    const old = projectV24.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 25 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 25
  ) {
    const old = projectV25.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 26 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 26
  ) {
    const old = projectV26.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 27 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 27
  ) {
    const old = projectV27.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 28 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 28
  ) {
    const old = projectV28.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 29 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 29
  ) {
    const old = projectV29.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 30 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 30
  ) {
    const old = projectV30.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 31 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 31
  ) {
    const old = projectV31.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 32 };
  }
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion === 32
  ) {
    const old = projectV32.safeParse(value);
    if (old.success) value = { ...old.data, schemaVersion: 33 };
  }
  const parsed = projectSchema.safeParse(value);
  if (!parsed.success) {
    const panelFactorIssue = parsed.error.issues.find(
      (v) => v.path[0] === "surfacePanels" && v.path[2] === "stiffness",
    );
    if (panelFactorIssue)
      throw new Error(
        `Painel ${Number(panelFactorIssue.path[1]) + 1} · ${String(panelFactorIssue.path[3] ?? "rigidez").toUpperCase()} exige um fator finito, maior que zero.`,
      );
    const factorIssue = parsed.error.issues.find(
      ({ path }) =>
        path[0] === "members" && path[2] === "stiffness" && path.length === 4,
    );
    if (
      factorIssue &&
      value &&
      typeof value === "object" &&
      "members" in value &&
      Array.isArray(value.members)
    ) {
      const [, index, , component] = factorIssue.path;
      const member = value.members[Number(index)];
      const key = component as keyof typeof stiffnessLabels;
      const name =
        typeof member.name === "string"
          ? member.name
          : String(Number(index) + 1);
      const reason = stiffnessFactorError(member.stiffness[key]);
      throw new Error(`Barra ${name} · ${stiffnessLabels[key]}. ${reason}`);
    }
    const springIssue = parsed.error.issues.find(
      ({ path }) =>
        path[0] === "nodes" && path[2] === "springs" && path.length === 4,
    );
    if (
      springIssue &&
      value &&
      typeof value === "object" &&
      "nodes" in value &&
      Array.isArray(value.nodes)
    ) {
      const [, index, , dof] = springIssue.path;
      const node = value.nodes[Number(index)];
      const name =
        typeof node?.name === "string" ? node.name : String(Number(index) + 1);
      throw new Error(
        `Nó ${name} · ${String(dof).toUpperCase()}. Informe uma rigidez de mola finita e não negativa.`,
      );
    }
    throw new Error(
      "Formato incompatível. Use um projeto KStruct da versão 1 à 32, com valores numéricos finitos.",
    );
  }
  normalizeSlabPressureVertices(parsed.data);
  if (!parsed.data.slabJoint && parsed.data.slabs.length === 2)
    refreshJoint(parsed.data);
  const errors = referenceErrors(parsed.data);
  if (errors.length) throw new Error(errors.join("\n"));
  if (source.length * 3 > projectFileLimit) serializeProject(parsed.data);
  return parsed.data;
}

function projectObjectIds(p: Pick<Project, "nodes" | "members" | "slabs">) {
  return {
    node: new Set(p.nodes.map((n) => n.id)),
    member: new Set(p.members.map((m) => m.id)),
    slab: new Set(p.slabs.map((s) => s.id)),
  };
}

export function referenceErrors(p: Project): string[] {
  const errors: string[] = [];
  errors.push(...panelModelErrors(p), ...loadPanelErrors(p));
  for (const list of [
    p.sectionCuts ?? [],
    p.serviceMeasures ?? [],
    p.loadPanels ?? [],
    p.surfacePanels ?? [],
    p.nodes,
    p.members,
    p.slabs,
    p.materials,
    p.sections,
    p.loadPatterns,
    p.analysisCases,
    p.resultCombinations,
    p.resultEnvelopes,
    p.selectionGroups,
    p.diaphragms ?? [],
    ...Object.values(p.guides),
  ]) {
    if (new Set(list.map((v) => v.id)).size !== list.length)
      errors.push("Há identificadores duplicados no projeto.");
  }
  if (p.selectionGroups.length) {
    const ids = projectObjectIds(p);
    const names = new Set<string>();
    for (const group of p.selectionGroups) {
      const name = group.name.trim().toLocaleLowerCase("pt-BR");
      if (names.has(name))
        errors.push(`Já existe um grupo com o nome “${group.name}”.`);
      names.add(name);
      if (group.objects.some((o) => !ids[o.kind].has(o.id)))
        errors.push(`Grupo ${group.name} contém um objeto inexistente.`);
      if (
        new Set(group.objects.map(selectionKey)).size !== group.objects.length
      )
        errors.push(`Grupo ${group.name} contém um objeto repetido.`);
    }
  }
  for (const guides of Object.values(p.guides)) {
    if (
      guides.some((a, i) =>
        guides
          .slice(i + 1)
          .some((b) => Math.abs(a.position - b.position) < tolerance),
      )
    )
      errors.push(
        "Use posições distintas para os eixos ou pavimentos do mesmo grupo.",
      );
  }
  const nodes = new Map(p.nodes.map((n) => [n.id, n]));
  for (const n of p.nodes) {
    for (const dof of supportDofs) {
      if (!hasSpring(n, dof)) continue;
      if (n.restraints[dof])
        errors.push(
          `${n.name} (${n.id}): ${dof.toUpperCase()} tem mola e restrição rígida simultâneas.`,
        );
      if (p.mode === "planar" && (dof === "uy" || dof === "rx" || dof === "rz"))
        errors.push(
          `${n.name} (${n.id}): mola ${dof.toUpperCase()} fora do plano XZ.`,
        );
    }
    if (n.foundation) {
      if (p.mode !== "spatial")
        errors.push(`${n.name}: uma matriz de fundação exige um nó espacial.`);
      try {
        globalFoundationMatrix(n.foundation, n.supportFrame);
      } catch (error) {
        errors.push(`${n.name}: ${(error as Error).message}`);
      }
    }
    if (!n.supportFrame) continue;
    if (n.supportFrame.kind !== p.mode) {
      errors.push(
        `${n.name}: o referencial do apoio precisa corresponder ao modo do projeto.`,
      );
      continue;
    }
    try {
      supportBasis(n.supportFrame);
    } catch (error) {
      errors.push(`${n.name}: ${(error as Error).message}`);
    }
  }
  const sections = new Map(p.sections.map((s) => [s.id, s]));
  const materials = new Map(
    p.materials.map((material) => [material.id, material]),
  );
  for (const m of p.members) {
    if (!nodes.has(m.start) || !nodes.has(m.end))
      errors.push(`${m.name}: nó de extremidade inexistente.`);
    const a = nodes.get(m.start),
      b = nodes.get(m.end);
    if (a && b) {
      const error = offsetError(m, a, b, p.mode);
      if (error) errors.push(error);
    }
    const section = sections.get(m.sectionId);
    if (!section) errors.push(`${m.name}: seção inexistente.`);
    else if (m.stiffness) {
      const material = materials.get(section.materialId);
      if (material) {
        const error = memberStiffnessError(
          p.mode,
          sectionProperties(section),
          material,
          m.stiffness,
        );
        if (error) errors.push(`${m.name} (${m.id}): ${error}`);
      }
    }
  }
  try {
    connectionStations(p);
  } catch (error) {
    errors.push((error as Error).message);
  }
  for (const s of p.sections)
    if (!p.materials.some((m) => m.id === s.materialId))
      errors.push(`${s.name}: material inexistente.`);
  if (p.slabJoint) {
    const j = p.slabJoint;
    if (
      j.a.slabId === j.b.slabId ||
      [j.a, j.b].some(
        (ref) =>
          !p.slabs.some(
            (s) =>
              s.id === ref.slabId &&
              slabRings(s)[0].some((v) => v.edgeId === ref.edgeId),
          ),
      )
    )
      errors.push(
        "A ligação referencia uma laje ou borda externa inexistente.",
      );
    if (j.memberId && !p.members.some((m) => m.id === j.memberId))
      errors.push("A viga referenciada pela borda comum não existe.");
  }
  for (const slab of p.slabs) {
    if (p.mode !== "spatial")
      errors.push(
        `${slab.name}: a laje exige um projeto espacial em planta XY.`,
      );
    if (!p.materials.some((m) => m.id === slab.materialId))
      errors.push(`${slab.name}: material inexistente.`);
    if (!p.guides.z.some((level) => level.id === slab.levelId))
      errors.push(`${slab.name}: pavimento inexistente.`);
    if (slab.polygon || slab.sizing) {
      const error = slab.polygon ? polygonError(slab.polygon.rings) : null;
      if (error) errors.push(`${slab.name} · ${error}`);
      else {
        try {
          meshSlab(slab, 0);
        } catch (e) {
          errors.push(
            `${slab.name} · ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
      if (slab.polygon) continue;
    }
    for (const [start, span, count] of [
      [slab.x, slab.lengthX, slab.divisionsX],
      [slab.y, slab.lengthY, slab.divisionsY],
    ]) {
      const end = start + span;
      const step = span / count;
      if (
        !Number.isFinite(end) ||
        step < tolerance ||
        end - step >= end ||
        start + step <= start
      ) {
        errors.push(
          `${slab.name}: dimensões ou subdivisões incompatíveis com as coordenadas da malha.`,
        );
        break;
      }
    }
  }
  const membersById = new Map(p.members.map((m) => [m.id, m]));
  for (const pat of p.loadPatterns) {
    const windIds = new Set<string>();
    for (const strip of pat.wind ?? []) {
      if (windIds.has(strip.id))
        errors.push(`${pat.name}: faixa de vento com ID repetido.`);
      windIds.add(strip.id);
      try {
        distributeWind(nodes, p.mode, strip);
      } catch (error) {
        errors.push(`${pat.name} · ${strip.name}: ${(error as Error).message}`);
      }
    }
    const motions = new Set<string>();
    for (const { nodeId, dof } of pat.prescribed ?? []) {
      const node = nodes.get(nodeId);
      const label = `${pat.name} · ${node?.name ?? nodeId} · ${dof.toUpperCase()}`;
      if (!node)
        errors.push(`${label}: movimento prescrito em nó inexistente.`);
      else if (p.mode === "planar" && ["uy", "rx", "rz"].includes(dof))
        errors.push(`${label}: movimento prescrito fora do plano XZ.`);
      else if (!node.restraints[dof])
        errors.push(
          `${label}: o movimento prescrito exige restrição rígida. Remova a prescrição antes de liberar o grau de liberdade.`,
        );
      const key = nodeId + ":" + dof;
      if (motions.has(key))
        errors.push(`${label}: movimento prescrito repetido no mesmo padrão.`);
      motions.add(key);
    }
    const seen = new Set<string>();
    for (const load of pat.points ?? []) {
      const m = membersById.get(load.memberId);
      if (!m) {
        errors.push(`${pat.name}: carga concentrada em barra inexistente.`);
        continue;
      }
      if (seen.has(load.id))
        errors.push(`${pat.name}: carga concentrada com ID repetido.`);
      seen.add(load.id);
      const a = nodes.get(m.start),
        b = nodes.get(m.end);
      if (!a || !b) continue;
      const error =
        positionError(load.position, memberAxis(m, a, b).span) ??
        componentError(load, p.mode);
      if (error) errors.push(`${pat.name} · ${m.name}: ${error}`);
    }
    for (const load of pat.distributed ?? []) {
      const m = membersById.get(load.memberId);
      if (!m) {
        errors.push(`${pat.name}: carga distribuída em barra inexistente.`);
        continue;
      }
      if (seen.has(load.id))
        errors.push(`${pat.name}: ID de carga distribuída repetido.`);
      seen.add(load.id);
      const a = nodes.get(m.start),
        b = nodes.get(m.end);
      if (!a || !b) continue;
      const error = distributedLoadError(
        load,
        memberAxis(m, a, b).span,
        p.mode,
      );
      if (error) errors.push(`${pat.name} · ${m.name}: ${error}`);
    }
    const heated = new Set<string>();
    for (const field of pat.thermal ?? []) {
      const m = membersById.get(field.memberId);
      if (!m) {
        errors.push(`${pat.name}: ação térmica em barra inexistente.`);
        continue;
      }
      if (heated.has(m.id))
        errors.push(`${pat.name} · ${m.name}: ação térmica repetida.`);
      heated.add(m.id);
      const section = sections.get(m.sectionId);
      const material = section && materials.get(section.materialId);
      if (section && material) {
        const error = thermalFieldError(field, p.mode, section, material.alpha);
        if (error) errors.push(`${pat.name} · ${m.name}: ${error}`);
      }
    }
    if (pat.nodal.some((l) => !nodes.has(l.nodeId)))
      errors.push(`${pat.name}: carga em nó inexistente.`);
    if (pat.uniform.some((l) => !p.members.some((m) => m.id === l.memberId)))
      errors.push(`${pat.name}: carga em barra inexistente.`);
    for (const load of pat.pressure) {
      const slab = p.slabs.find((s) => s.id === load.slabId);
      if (!slab) continue;
      if (load.direction === "X" || load.direction === "Y")
        errors.push(
          slab.name +
            " · a laje horizontal em flexão aceita somente a normal ou Z global.",
        );
      const reason = pressureSpecError(
        load,
        load.pz,
        slabPressureVertices(slab, 0).map((v) => v.id),
      );
      if (reason) errors.push(slab.name + " · " + reason);
    }
    if (new Set(pat.pressure.map((l) => l.slabId)).size !== pat.pressure.length)
      errors.push(`${pat.name}: há duas pressões para a mesma laje no padrão.`);
    if (
      pat.pressure.some(
        (load) => !p.slabs.some((slab) => slab.id === load.slabId),
      )
    )
      errors.push(`${pat.name}: pressão em laje inexistente.`);
  }
  for (const c of p.analysisCases)
    if (
      c.factors.some((f) => !p.loadPatterns.some((l) => l.id === f.patternId))
    )
      errors.push(`${c.name}: padrão de carga inexistente.`);
  const cases = new Set(p.analysisCases.map((item) => item.id));
  if (p.combinationProfile) {
    const { actions, families } = p.combinationProfile;
    if (actions.some((a) => !cases.has(a.caseId)))
      errors.push("O perfil de combinações referencia um caso inexistente.");
    if (
      new Set(actions.map((a) => a.caseId)).size !== actions.length ||
      new Set(families.map((f) => f.id)).size !== families.length
    )
      errors.push("O perfil contém casos ou famílias repetidos.");
  }
  const generated = p.resultCombinations.flatMap((c) =>
    c.generation ? [generationKey(c.generation)] : [],
  );
  if (new Set(generated).size !== generated.length)
    errors.push("Há duas combinações com a mesma origem no gerador.");
  for (const combination of p.resultCombinations) {
    const caseIds = combination.factors.map((term) => term.caseId);
    if (caseIds.some((caseId) => !cases.has(caseId)))
      errors.push(
        `A combinação ${combination.name} referencia um caso estático inexistente.`,
      );
    if (new Set(caseIds).size !== caseIds.length)
      errors.push(
        `Use cada caso em uma única parcela da combinação ${combination.name}.`,
      );
    if (!combination.factors.some((term) => term.factor !== 0))
      errors.push(
        `Informe pelo menos um fator diferente de zero na combinação ${combination.name}.`,
      );
  }
  const combinations = new Set(p.resultCombinations.map(({ id }) => id));
  for (const envelope of p.resultEnvelopes) {
    if (envelope.combinationIds.some((id) => !combinations.has(id)))
      errors.push(
        `O envelope ${envelope.name} referencia uma combinação inexistente.`,
      );
    if (
      new Set(envelope.combinationIds).size !== envelope.combinationIds.length
    )
      errors.push(
        `Inclua cada combinação uma única vez no envelope ${envelope.name}.`,
      );
  }
  if (!errors.length && p.diaphragms?.length)
    errors.push(...diaphragmErrors(p));
  return errors;
}

export function analysisErrors(p: Project): string[] {
  const errors = referenceErrors(p);
  if (errors.length) return errors;
  if (p.surfacePanels?.length) {
    try {
      panelAssembly(p);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
    return errors;
  }
  if (p.slabs.length === 2) {
    errors.push(...jointGeometryErrors(p));
    const edge = sharedEdges(p)[0];
    if (!errors.length && edge && rank(rigidFloorRows(p, edge), 6) < 6)
      errors.push(
        "Apoios insuficientes nas lajes. A borda deixa movimento de corpo rígido em pelo menos um dos painéis.",
      );
    if (p.members.length) frameAnalysisErrors(p, errors);
    return errors;
  }
  const [slab] = p.slabs;
  if (slab) {
    if (p.nodes.length || p.members.length)
      errors.push(
        "Analise a laje isolada em um projeto sem nós ou barras lançados.",
      );
    if (
      slab.formulation === "qdkt" &&
      !Object.values(slab.supports).every(Boolean)
    )
      errors.push(
        `${slab.name}: a análise QDKT exige apoio simples nas quatro bordas.`,
      );
    else if (
      slab.polygon
        ? !stablePolygonSupports(slab.polygon.rings)
        : Object.values(slab.supports).filter(Boolean).length < 2
    )
      errors.push(
        `${slab.name}: aplique apoio simples em pelo menos duas bordas que não estejam na mesma reta para impedir movimento de corpo rígido.`,
      );
    const material = p.materials.find((item) => item.id === slab.materialId)!;
    const rigidity =
      (material.E * slab.thickness ** 3) / (12 * (1 - material.nu ** 2));
    if (
      !(rigidity > 0) ||
      !Number.isFinite(rigidity) ||
      (!slab.polygon && !Number.isFinite(slab.lengthX * slab.lengthY))
    )
      errors.push(
        `${slab.name}: espessura, material ou área fora do intervalo numérico da análise.`,
      );
    return errors;
  }
  return frameAnalysisErrors(p, errors);
}

function frameAnalysisErrors(p: Project, errors: string[]) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  if (
    !p.members.length &&
    !p.diaphragms?.length &&
    !p.nodes.some((n) => n.foundation)
  )
    errors.push("Lance pelo menos uma barra para analisar.");
  if (p.mode === "planar") {
    if (p.nodes.some((n) => Math.abs(n.y) > 1e-8))
      errors.push(
        "Em um projeto plano, todos os nós devem estar em XZ (Y = 0).",
      );
    if (
      p.nodes.some(
        (n) => n.restraints.uy || n.restraints.rx || n.restraints.rz,
      ) ||
      p.members.some((m) => m.roll) ||
      p.loadPatterns.some(
        (l) =>
          l.nodal.some((f) => f.fy || f.mx || f.mz) ||
          l.uniform.some((q) => q.qy),
      )
    )
      errors.push(
        "Apoios, cargas e rotação de seção fora do plano XZ exigem um projeto espacial.",
      );
  }
  const edges = new Map(p.nodes.map((n) => [n.id, new Set<string>()]));
  const pairs = new Set<string>();
  const incidences = connectionStations(p);
  for (const m of p.members) {
    const a = byId.get(m.start)!;
    const b = byId.get(m.end)!;
    if (distance(a, b) < tolerance) errors.push(`${m.name}: comprimento nulo.`);
    // Regular refinement nodes only subdivide these edges and carry no restraints.
    let previous = m.start;
    for (const current of [
      ...(incidences.get(m.id) ?? []).map((s) => s.nodeId),
      m.end,
    ]) {
      edges.get(previous)!.add(current);
      edges.get(current)!.add(previous);
      previous = current;
    }
    const key = [m.start, m.end].sort().join("|");
    if (pairs.has(key)) errors.push(`${m.name}: barra duplicada.`);
    pairs.add(key);
  }
  const floorNodes = new Set(p.diaphragms?.flatMap((f) => f.nodeIds));
  for (const n of p.nodes) {
    if (edges.get(n.id)!.size || floorNodes.has(n.id)) continue;
    const host = p.members.find(
      (m) =>
        interiorParameter(n, byId.get(m.start)!, byId.get(m.end)!) !== null,
    );
    if (n.foundation && !host) continue;
    errors.push(
      host
        ? `${n.name} está isolado no interior de ${host.name}. Use Conexões da malha.`
        : "Remova ou conecte os nós isolados antes de analisar.",
    );
  }
  if (
    p.nodes.some((a, i) =>
      p.nodes.slice(i + 1).some((b) => distance(a, b) < tolerance),
    )
  )
    errors.push(
      "Há nós coincidentes com IDs distintos. Conecte as barras ao mesmo nó.",
    );
  const bodies: StructuralNode[][] = [];
  const visited = new Set<string>();
  for (const seed of p.nodes) {
    if (visited.has(seed.id)) continue;
    const stack = [seed.id];
    const component: StructuralNode[] = [];
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      component.push(byId.get(id)!);
      stack.push(...edges.get(id)!);
    }
    if (component.some((n) => floorNodes.has(n.id))) {
      bodies.push(component);
      continue;
    }
    const span = Math.max(
      component.length === 1 && seed.foundation ? 1 : tolerance,
      ...component.map((n) => distance(n, seed)),
    );
    const constraints: number[][] = [];
    for (const n of component) {
      const pos = scale(subtract(n, seed), 1 / span);
      const basis = supportBasis(n.supportFrame);
      constraints.push(...foundationConstraintRows(n, pos, span));
      const row = (u: Point3, r: Point3) =>
        p.mode === "planar" ? [u.x, u.z, r.y] : [u.x, u.y, u.z, r.x, r.y, r.z];
      for (const k of coordinates) {
        const axis = basis[k];
        // a·(u + ω × r) = a·u + (r × a)·ω.
        if (supportsDof(n, `u${k}`))
          constraints.push(row(axis, cross(pos, axis)));
        if (supportsDof(n, `r${k}`)) constraints.push(row(origin, axis));
      }
    }
    const dofs = p.mode === "planar" ? 3 : 6;
    const bearing =
      p.slabJoint?.support === "beam"
        ? p.members.find((m) => m.id === p.slabJoint?.memberId)
        : undefined;
    const edge =
      bearing && component.some((n) => n.id === bearing.start)
        ? sharedEdges(p)[0]
        : undefined;
    let rigidRank = rank(constraints, dofs),
      required = dofs;
    if (edge && p.slabJoint) {
      // A supported panel can restrain the frame vertically, and vice versa.
      // Rank the rigid motions of the connected frame and both panels together.
      const zero = Array<number>(6).fill(0),
        coupled = constraints.map((row) => [...row, ...zero]);
      coupled.push(
        ...rigidFloorRows(p, edge, false).map((row) => [...zero, ...row]),
      );
      const length = Math.hypot(
        edge.end.x - edge.start.x,
        edge.end.y - edge.start.y,
      );
      for (const pt of [edge.start, edge.end]) {
        const x = (pt.x - seed.x) / span,
          y = (pt.y - seed.y) / span;
        coupled.push([
          0,
          0,
          1,
          y,
          -x,
          0,
          -1,
          -(pt.y - edge.start.y) / length,
          (pt.x - edge.start.x) / length,
          0,
          0,
          0,
        ]);
      }
      required = 12;
      rigidRank = rank(coupled, required);
    }
    if (rigidRank < required)
      errors.push(
        `Estrutura ligada a ${seed.name}: apoios insuficientes para impedir movimento de corpo rígido.`,
      );
  }
  if (bodies.length) errors.push(...diaphragmStability(p, bodies));
  return [...new Set(errors)];
}

export function nextName(prefix: string, objects: { name: string }[]) {
  let i = 1;
  const names = new Set(objects.map((o) => o.name));
  while (names.has(`${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

function hasMember(p: Project, a: string, b: string) {
  return p.members.some(
    (m) => (m.start === a && m.end === b) || (m.start === b && m.end === a),
  );
}

export function appendMember(
  p: Project,
  properties: Omit<Member, "id" | "name">,
) {
  if (hasMember(p, properties.start, properties.end))
    throw new Error("Já existe uma barra entre esses nós.");
  const bar = { ...properties, id: uid(), name: nextName("B", p.members) };
  p.members.push(bar);
  return bar;
}

export function addPoint(p: Project, point: Point3): StructuralNode {
  const existing = p.nodes.find((n) => distance(n, point) < tolerance);
  if (existing) return existing;
  const n: StructuralNode = {
    x: point.x,
    y: point.y,
    z: point.z,
    id: uid(),
    name: nextName("N", p.nodes),
    restraints: free(),
  };
  p.nodes.push(n);
  return n;
}

export function removeSelection(p: Project, selection: SelectedObject[]) {
  const nodes = new Set(
    selection.filter((s) => s.kind === "node").map((s) => s.id),
  );
  const bars = new Set(
    selection.filter((s) => s.kind === "member").map((s) => s.id),
  );
  const slabs = new Set(
    selection.filter((s) => s.kind === "slab").map((s) => s.id),
  );
  p.members = p.members.filter((m) => {
    if (nodes.has(m.start) || nodes.has(m.end)) bars.add(m.id);
    return !bars.has(m.id);
  });
  p.meshConnections = p.meshConnections.filter(
    (l) => !nodes.has(l.nodeId) && !bars.has(l.memberId),
  );
  remapDiaphragmNodes(p, new Map([...nodes].map((id) => [id, []])));
  p.nodes = p.nodes.filter((n) => !nodes.has(n.id));
  p.slabs = p.slabs.filter((slab) => !slabs.has(slab.id));
  if (p.slabJoint) {
    if (slabs.has(p.slabJoint.a.slabId) || slabs.has(p.slabJoint.b.slabId))
      delete p.slabJoint;
    else if (p.slabJoint.memberId && bars.has(p.slabJoint.memberId)) {
      p.slabJoint.support = "none";
      delete p.slabJoint.memberId;
    }
  }
  const removed = { node: nodes, member: bars, slab: slabs };
  for (const group of p.selectionGroups)
    group.objects = group.objects.filter((o) => !removed[o.kind].has(o.id));
  for (const pat of p.loadPatterns) {
    if (pat.wind)
      pat.wind = pat.wind.filter(
        (w) => !nodes.has(w.bottomId) && !nodes.has(w.topId),
      );
    pat.uniform = pat.uniform.filter((l) => !bars.has(l.memberId));
    if (pat.thermal)
      pat.thermal = pat.thermal.filter((l) => !bars.has(l.memberId));
    if (pat.points)
      pat.points = pat.points.filter((l) => !bars.has(l.memberId));
    if (pat.distributed)
      pat.distributed = pat.distributed.filter((l) => !bars.has(l.memberId));
    pat.nodal = pat.nodal.filter((l) => !nodes.has(l.nodeId));
    if (pat.prescribed)
      pat.prescribed = pat.prescribed.filter((l) => !nodes.has(l.nodeId));
    pat.pressure = pat.pressure.filter((load) => !slabs.has(load.slabId));
  }
}
