"""Compute the space frame benchmark by direct stiffness, with one beam per bar.

Run with NumPy from any directory:
    python tests/fixtures/portal-spatial-reference.py > tests/fixtures/portal-spatial-expected.json
"""
import json
from math import cos, fsum, pi, radians, sin, tanh
from pathlib import Path

import numpy as np


def torsion_constant(width, height):
    a, b = sorted((width, height), reverse=True)
    correction = fsum(tanh(n * pi * a / (2 * b)) / n**5 for n in range(1, 4001, 2))
    return a * b**3 / 3 - 64 * b**4 * correction / pi**5


def basis(start, end, angle):
    vector = end - start
    span = np.linalg.norm(vector)
    axis = vector / span
    reference = np.array([1., 0., 0.]) if np.allclose(axis[:2], 0) else np.array([0., 0., 1.])
    up = reference - (reference @ axis) * axis
    up /= np.linalg.norm(up)
    side = np.cross(up, axis)
    theta = radians(angle)
    return span, np.array([axis, cos(theta) * side + sin(theta) * up,
                          cos(theta) * up - sin(theta) * side])


def stiffness(length, e, g, width, height):
    k = np.zeros((12, 12))
    tension = e * width * height
    torsion = g * torsion_constant(width, height)
    for dofs, rigidity in (([0, 6], tension), ([3, 9], torsion)):
        k[np.ix_(dofs, dofs)] = rigidity / length * np.array([[1, -1], [-1, 1]])

    bending = np.array([
        [12, 6 * length, -12, 6 * length],
        [6 * length, 4 * length**2, -6 * length, 2 * length**2],
        [-12, -6 * length, 12, -6 * length],
        [6 * length, 2 * length**2, -6 * length, 4 * length**2],
    ])
    for dofs, inertia, signs in (
        ([1, 5, 7, 11], height * width**3 / 12, [1, 1, 1, 1]),
        ([2, 4, 8, 10], width * height**3 / 12, [1, -1, 1, -1]),
    ):
        k[np.ix_(dofs, dofs)] = e * inertia / length**3 * bending * np.outer(signs, signs)
    return k


def beam_load(q, length):
    force = q * length / 2
    moment = np.cross([1, 0, 0], q) * length**2 / 12
    return np.r_[force, moment, force, -moment]


def solve(model):
    nodes = np.array(model["nodes"], dtype=float)
    e = model["e"]
    g = e / (2 * (1 + model["nu"]))
    ndof = 6 * len(nodes)
    k = np.zeros((ndof, ndof))
    f = np.zeros(ndof)
    elements = []
    for node, *values in model["nodal"]:
        f[6 * node : 6 * (node + 1)] += values
    for index, (start, end, angle) in enumerate(model["members"]):
        length, axes = basis(nodes[start], nodes[end], angle)
        t = np.kron(np.eye(4), axes)
        local = stiffness(length, e, g, *model["section"])
        dofs = list(range(6 * start, 6 * (start + 1))) + list(range(6 * end, 6 * (end + 1)))
        load = sum((beam_load(axes @ np.array(q), length)
                    for member, *q in model["uniform"] if member == index), np.zeros(12))
        k[np.ix_(dofs, dofs)] += t.T @ local @ t
        f[dofs] += t.T @ load
        elements.append((local, t, dofs, load))

    fixed = [6 * i + j for i in model["fixed"] for j in range(6)]
    free = np.setdiff1d(np.arange(ndof), fixed)
    u = np.zeros(ndof)
    u[free] = np.linalg.solve(k[np.ix_(free, free)], f[free])
    r = k @ u - f
    ends = []
    for local, t, dofs, load in elements:
        action = local @ t @ u[dofs] - load
        ends.append([(-action[:6]).tolist(), action[6:].tolist()])
    return {
        "displacements": u.reshape(-1, 6).tolist(),
        "reactions": r.reshape(-1, 6)[model["fixed"]].tolist(),
        "endForces": ends,
    }


if __name__ == "__main__":
    model = json.loads(Path(__file__).with_name("portal-spatial.json").read_text())
    print(json.dumps(solve(model), indent=2))
