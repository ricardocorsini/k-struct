# KStruct

**Análise estrutural open source, parte do ecossistema OpenStruct.**

KStruct faz referência à matriz de rigidez **[K]**. A direção do produto é um ambiente completo de lançamento, análise e interpretação de estruturas, com a fluidez de trabalho de ferramentas como SAP2000 e uma identidade própria.

![Interface inicial do KStruct](docs/images/editor.webp)

## Etapa 03 · Pórticos espaciais

O editor trabalha com projetos **planos XZ** ou **espaciais XYZ** e usa a mesma seleção na vista de lançamento, na perspectiva 3D e no explorador. Os instaladores da etapa 02 correspondem à versão 0.2.0 alpha. O lançamento espacial está no código da etapa 03.

- Lançar barras e nós em planta XY ou elevações XZ/YZ, com eixos, pavimentos, modo ortogonal e snap em referências ou passos de 0,50 m.
- Selecionar, replicar por deslocamento e conectar interseções em 3D. As cópias levam geometria, seção e orientação, com nós novos sem apoios nem cargas.
- Editar coordenadas, apoios nos graus de liberdade do projeto, seção retangular, orientação da seção e cargas globais.
- Aplicar forças e momentos nodais e cargas uniformes em barras. Peso próprio é manual nesta etapa.
- Salvar e reabrir `.kstruct.json` no esquema v2, com migração dos projetos v1 na abertura. Desfazer e refazer até 50 edições e recuperar o último rascunho local.
- Executar o OOFEM 3.0 integrado nos pacotes Windows e Linux, com diagnóstico, cancelamento e histórico local.
- Resolver a estática linear com `Beam2d` ou `Beam3d`. Consultar os seis componentes de reações, deslocamentos e esforços no modelo espacial, além de deformada, diagramas, CSV e saída do OOFEM.
- Invalidar resultados após alterações. Verificar conectividade, apoios de cada componente e equilíbrio global antes de apresentar resultados.

No navegador, use o editor e a exportação de entrada. O botão **Analisar** executa o solver nativo na aplicação desktop.

## Instalar e executar

Os pacotes de teste para Windows (NSIS) e Linux (.deb e AppImage) estão no workflow de empacotamento. Consulte [os downloads e o procedimento de instalação](docs/DISTRIBUTION.md).

Para desenvolvimento, use Node.js 22.12 ou superior.

```sh
npm ci
npm run dev
```

Abra `http://127.0.0.1:1420`. Para o aplicativo desktop, instale Rust 1.89 ou superior e os [pré-requisitos do Tauri 2](https://v2.tauri.app/start/prerequisites/).

```sh
npm run desktop:dev
```

Para compilar a aplicação e os pacotes da plataforma atual:

```sh
npm run desktop:build
```

A compilação dos pacotes prepara o OOFEM a partir do commit fixado da versão 3.0. No modo de desenvolvimento, configure um executável com `OOFEM_BIN` ou pelo caminho em **Configurar OOFEM**. Consulte [seleção e diagnóstico do motor](docs/OOFEM.md).

## Primeiro uso

1. Abra **Viga de referência**. Ela contém 6 m de vão, seção 15 × 20 cm, E = 200 GPa e carga de −10 kN/m em Z.
2. Selecione a barra ou um nó em qualquer vista ou no explorador. As propriedades aparecem à direita.
3. No desktop instalado, clique **Analisar**. Reações esperadas de 30 kN por apoio, momento de meio de vão 45 kN·m e flecha −8,4375 mm.
4. Altere a carga e analise novamente. A edição remove os resultados anteriores.
5. Para começar do zero, use **Novo projeto** para XZ ou **Novo pórtico espacial** para XYZ. Ative **Barra** (`B`) e marque duas extremidades. Defina apoios e cargas antes de analisar.

No modelo espacial, defina os eixos e as cotas em **Eixos e pavimentos**. Escolha o pavimento para lançar vigas em planta e alterne para uma elevação para lançar pilares. **Orto** alinha a segunda extremidade no plano. Segure `Shift` para inverter o modo durante o clique. Use `Ctrl` ou `Shift` para montar uma seleção e **Replicar** para copiar a geometria até outro pavimento. Use **Conectar interseções** onde as barras precisam compartilhar nós.

Atalhos: `V` selecionar, `N` nó, `B` barra, `Esc` cancelar lançamento, `Delete` excluir seleção, `Ctrl+Z` desfazer, `Ctrl+Shift+Z` refazer e `Ctrl+S` salvar. Na elevação, scroll aproxima e afasta, botão central arrasta. A vista 3D orbita ao arrastar.

## Verificação

```sh
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

Os benchmarks numéricos exigem `OOFEM_BIN`. Sem ele, aparecem explicitamente como **skipped**. A CI executa os benchmarks com o commit da tag 3.0 e verifica os pacotes instalados em Windows e Linux.

```sh
OOFEM_BIN=/caminho/absoluto/oofem npm test
OOFEM_BIN=/caminho/absoluto/oofem npm run test:e2e -- spatial.spec.ts
cargo test --manifest-path crates/solver-runner/Cargo.toml
```

Veja [validação e limites](docs/VALIDATION.md), [arquitetura](docs/ARCHITECTURE.md) e [sequência de desenvolvimento](docs/ROADMAP.md).

## Licenças

Código original KStruct sob MIT. Os pacotes desktop incluem o OOFEM como executável independente, com sua licença LGPL-2.1-or-later, fontes correspondentes e instruções de compilação. [Avisos de terceiros](THIRD_PARTY_NOTICES.md).

Desenvolvimento inicial. Cada ampliação da capacidade de análise deve ser acompanhada por casos de referência e verificações numéricas específicas.
