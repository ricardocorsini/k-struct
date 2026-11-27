# Arquitetura

## Fluxo

`Projeto editável → validação → malha de análise → entrada OOFEM → processo nativo → saída normalizada → tabelas e diagramas`

| Camada            | Responsabilidade                                                    | Local                        |
| ----------------- | ------------------------------------------------------------------- | ---------------------------- |
| Domínio           | Formato v33, migração v1 a v32, geometria, validação e histórico    | `src/domain`                 |
| Adaptador         | Discretização, IDs, unidades e sinais, leitura da saída             | `src/solver/oofem.ts`        |
| Combinações       | Superposição de deslocamentos, reações e esforços estáticos         | `src/solver/combinations.ts` |
| Envelopes         | Extremos por estação ou nó, combinação e componentes simultâneas    | `src/solver/envelopes.ts`    |
| Ponte desktop     | Abrir/salvar, configuração do motor e IPC                           | `src/solver/desktop.ts`      |
| Processo          | Diretório temporário, execução sem shell, prazo e limpeza           | `crates/solver-runner`       |
| Aplicativo nativo | Registro do comando assíncrono e permissões                         | `src-tauri`                  |
| Interface         | Modelo compartilhado, vistas, propriedades e resultados             | `src/components`             |

React/TypeScript/Vite/Three.js no frontend. Tauri 2/Rust no desktop, seguindo os aplicativos OpenStruct. SVG é usado na elevação para seleção e desenho preciso. A perspectiva usa Three.js, renderizando apenas quando o modelo, câmera ou tamanho mudam.

## Modelo próprio

O esquema v27 contém o modo do projeto, referências de eixos X/Y e pavimentos Z, coordenadas XYZ, materiais, seções, nós, barras, lajes, diafragmas, padrões de carga, casos de análise, combinações e envelopes de resultados. O modo `planar` usa Y = 0 e UX/UZ/RY. As barras do modo `spatial` usam UX/UY/UZ/RX/RY/RZ. A leitura de v1 insere as referências iniciais, mantém o modo plano e preenche os novos componentes de apoio e carga com valores livres e nulos. A leitura de v1 e v2 inicia a lista de combinações vazia. Projetos v1 a v3 começam com a lista de envelopes vazia. A migração de v1 a v4 inicia a lista de lajes e as pressões de cada padrão vazias. A abertura dos dois formatos experimentais v5 preserva a formulação original. O formato com cota Z e pressões QDKT associa o painel ao pavimento correspondente ou cria uma referência na cota importada.

Cada vista de lançamento usa um plano ortogonal em uma posição de referência. A captura é medida em pixels de tela na seguinte ordem de prioridade: nós do plano ativo (12 px), ponto médio e pé da perpendicular sobre barras inteiramente contidas no plano ativo (12 px, vencendo a menor distância em tela), guias de eixos e pavimentos no modo espacial (10 px por eixo) e, por fim, a malha de 0,50 m. O modo Orto e sua inversão temporária por `Shift` são preservados na captura de barra. A entrada por coordenadas relativas (`ΔU`/`ΔV` no plano ativo, preservando a cota normal) aplica exatamente o par informado, aceitando vírgula e ponto. Os nós têm coordenadas independentes das referências. Copiar geometria aplica uma translação aos selecionados e reutiliza nós coincidentes no destino.

IDs do projeto são persistentes. O esquema v8 guarda em `meshConnections` os pares de IDs da barra e do nó interno. A migração de v7 cria uma lista vazia e conserva todas as peças e seus IDs. Um cruzamento confirmado em XYZ cria ou reutiliza um nó editável ao qual se podem atribuir apoios, cargas ou outras incidências.

`beamStations` ordena os nós internos pela projeção sobre o eixo físico i → j e intercala as estações regulares de `segmentsPerMember` (2 a 32, padrão 8). A tolerância geométrica é de 10⁻⁶ m. Uma incidência próxima a uma estação regular substitui essa estação na sua posição real. Conexões internas distintas na mesma estação são rejeitadas. Na exportação cada nó editável recebe um único número OOFEM e os nós de refinamento são privados de cada barra. O pré-processador verifica os apoios por componente conectado. A intensidade uniforme em N/m acompanha os elementos do membro e o OOFEM a integra em cada comprimento.

Em cada conexão interna, o parser conserva o esforço de extremidade final do elemento que chega (lado i) e o inicial do seguinte (lado j). Os dois registros compartilham `memberId`, `t = x/L` e deslocamento. Combinações e envelopes verificam a mesma sequência de posições e lados em todos os casos. Os diagramas unem os dois limites na mesma abscissa e o CSV identifica o lado da seção.

O painel retangular de laje tem ID persistente, origem XY, lados, referência ao pavimento, material, espessura, quatro condições de borda e subdivisões independentes em X/Y. `meshSlab` numera os nós em linhas de X crescente. Em QDKT cada célula forma um quadrilátero. Em DKT a diagonal do canto inferior esquerdo ao superior direito define dois triângulos anti-horários. As bordas referenciam os mesmos nós da conectividade. A malha e os resultados são derivados do painel na revisão atual. A análise de laje aceita um painel isolado por projeto.

O formato v24 admite um painel poligonal DKT com anéis de vértices em XY e refinamento uniforme. O primeiro anel delimita o exterior no sentido anti-horário e os seguintes delimitam as aberturas no sentido horário. Cada vértice guarda o ID da borda até o próximo vértice e seu apoio. A normalização transfere esses dados junto com o segmento físico. A migração de v23 conserva a representação retangular e seus IDs. Abrir um furo em um retângulo converte suas quatro bordas para a representação poligonal e conserva os vínculos.

A triangulação inicial usa Earcut pelo Three.js. O gerador insere vértices colineares omitidos em lados da triangulação e verifica a cobertura pela área líquida e pela incidência nos lados físicos e internos. Cada refinamento divide o triângulo em quatro e compartilha os nós médios entre vizinhos. O arquivo contém a descrição física dos contornos. Os IDs dos apoios independem da numeração da malha. A edição aceita até 128 vértices somando os anéis e de um a três refinamentos uniformes.

O formato v26 acrescenta `sizing` opcional à laje. Arquivos v25 mantêm as contagens X/Y ou os níveis de refinamento uniforme, o ID do painel e os vínculos de cada borda. No modo por tamanho, o arquivo guarda comprimentos em metros e IDs de bordas físicas. O seletor de apoios e contornos grava os IDs escolhidos no momento da edição. Ao dividir uma borda, ambos os segmentos herdam seu controle. Ao apagar um segmento, seu controle sai do painel.

No retângulo, `rectangularAxis` distribui os tamanhos em cada direção e gradua a malha a partir da borda selecionada. O alvo limita os lados da célula em X e Y. No DKT estruturado, a diagonal pode alcançar √2 vezes o alvo. A estrutura tensorial prolonga as linhas de subdivisão pelo painel. A entrada QDKT usa as posições locais de cada linha. No polígono, o tamanho admissível é o menor entre o alvo global e cada alvo local acrescido de metade da distância ao segmento físico. A marcação por lado é compartilhada pelos triângulos adjacentes e os dois usam o mesmo nó médio. O gerador verifica a quantidade de filhos e nós antes de cada rodada. O limite por tamanho é de 8.192 elementos e 8.192 nós.

A prévia e a exportação usam a mesma inspeção das áreas orientadas, da conectividade, dos ângulos dos triângulos e dos quatro Jacobianos dos quadriláteros. A consulta localiza a coordenada física no elemento e interpola os valores nodais com pesos baricêntricos no DKT e bilineares no retângulo QDKT. A referência da comparação contém o ponto, os três resultados, a soma das reações e a contagem de elementos. Uma mudança de malha invalida o resultado corrente, mas preserva essa referência. A referência é descartada quando muda o painel físico ou o caso.

O formato v27 aceita um par de lajes com uma borda externa inteira em comum e dois registros de pressão por padrão, um por laje. `slabJoint` referencia os IDs de laje e borda em cada lado. O apoio externo (sem apoio, linha vertical, viga por ID) é independente da ligação à flexão. A articulação é o valor inicial de uma nova ligação. A migração de v26 preserva o painel isolado. Os comprimentos estão em m e a rigidez distribuída em N·m/(rad·m).

O gerador ordena as estações da borda pelo sentido do contorno externo da primeira laje. Usa a união das duas malhas e das estações da viga, inclusive com a barra lançada em sentido oposto. No retângulo, introduz linhas correspondentes em X ou Y. No polígono DKT, divide os triângulos de bordo até o vértice oposto. O adaptador confere orientação, cobertura e incidência após compatibilizar os painéis. As duas lajes e a viga são resolvidas em um único arquivo OOFEM.

Em cada estação, UZ e a componente de rotação na direção normal à borda são comuns. Para a componente de rotação em torno da tangente, a articulação mantém dois graus e a continuidade impõe uma igualdade exata. A semirrígida usa a energia ½ kθ ℓ (θB − θA)². O comprimento tributário ℓ é a metade de cada intervalo adjacente. A soma dos comprimentos é o comprimento da borda. O apoio em viga compatibiliza somente o deslocamento vertical, preservando a torção própria da barra.

As equações locais incluem os apoios externos dos painéis nas pontas da borda. A eliminação de equações redundantes prioriza esses apoios, de modo que um par de rotações já fixadas não recebe uma segunda reação de vínculo. `GeneralSlaveNode` associa grandezas escalares aos graus físicos e `SlaveNode` aplica os coeficientes reais. Saltos auxiliares prescritos em zero medem o esforço conjugado de cada face pelas reações do próprio OOFEM. Retirar as parcelas de apoio de canto permite conferir os dois momentos independentemente. A saída verifica a lei da mola ou a igualdade de rotações, o equilíbrio de cada placa e o equilíbrio do pórtico com as cargas recebidas na interface.

A análise acoplada cobre uma borda comum retilínea entre dois painéis e uma viga de apoio de eixo coincidente com o trecho inteiro. Offsets e trechos rígidos nessa viga precisam de uma compatibilidade de eixo própria e são diagnosticados. Um recalque incompatível com o apoio fixo do painel ou um encontro de restrições verticais em referenciais incompatíveis também é identificado antes da execução.

O padrão de carga armazena ações. O caso de análise seleciona os padrões, os fatores e o procedimento. A combinação linear armazena IDs de casos estáticos e os respectivos fatores. O envelope guarda os IDs das combinações incluídas, na ordem escolhida. O editor aplica as mudanças de padrões, casos, combinações e envelopes em uma única edição. Antes de excluir um padrão, caso ou combinação, retire suas referências das definições que o utilizam.

### Materiais e atribuições

Cada material do projeto tem um ID estável e quatro propriedades elásticas e térmicas. O esquema v9 acrescenta `alpha` em 1/K. Na migração de v8, cada material recebe zero, valor historicamente escrito em `tAlpha`. As seções referenciam `materialId` e as lajes guardam sua própria referência direta. A lista de usos da biblioteca inclui ambos. Duplicar cria um ID novo. Reatribuir modifica somente a referência do destino.

O cadastro aceita valores finitos com E > 0 em Pa, 0 ≤ ν < 0,5, ρ > 0 em kg/m³ e α com sinal. O adaptador exporta `IsoLE` com `d`, `E`, `n` e `tAlpha` para barras e para a placa isolada. Os padrões e fatores de carga continuam determinando as ações aplicadas.

## Unidades e sinais

O esquema v10 discrimina as seções por `shape` e persiste somente os dados de identificação, material e dimensões da forma em metros. Projetos e rascunhos v1 a v9 passam pela migração que identifica os retângulos como `rectangle` e preserva ID, largura, altura e material. As barras continuam vinculadas por `sectionId`. A prévia do catálogo, o inspetor e o adaptador OOFEM usam `sectionProperties` de `src/domain/sections.ts`. O adaptador escreve A e Iy em `Beam2d` e acrescenta Iz e J (`Ik`) em `Beam3d`. A mudança de forma ou de atribuição passa pelo histórico e invalida os resultados da revisão.

O v13 guarda os fatores em `member.stiffness`. As barras de v12 migram sem fatores atribuídos. Cada componente ausente vale 1. O adaptador estático mantém A, densidade, ν e α. Para um fator axial a, usa E′ = aE em um material equivalente do deck e multiplica Iy, Iz e J pelos respectivos fatores divididos por a. O coeficiente de cisalhamento também é dividido por a para manter a rigidez de cisalhamento. Isso preserva a área, o volume e a massa geométrica. O catálogo e as cargas são lidos do projeto original. As inércias equivalentes do deck pertencem à representação estática. Uma análise dinâmica deverá usar as inércias geométricas na massa rotacional.

Persistência e entrada do solver em N, m, kg, s e rad. As preferências locais de apresentação selecionam comprimentos (m/cm/mm), dimensões de seção (m/cm/mm), deslocamentos (m/cm/mm), forças (N/kN), momentos (N·m/kN·m), cargas distribuídas (N/m ou kN/m) e E (MPa/GPa). Os padrões continuam m, cm, mm, kN, kN·m, kN/m e GPa, respectivamente. Rotações nas tabelas permanecem em mrad, orientação da seção em graus e pressão da laje em kN/m², sempre identificadas.

`src/units.ts` concentra as definições e conversões nas duas direções, validação das preferências e leitura decimal com ponto ou vírgula. O contexto em `src/components/Units.tsx` guarda a preferência em `kstruct.units`, separada do projeto e do histórico. Alterar unidades não avança a revisão estrutural, não executa o solver e não invalida resultados. Entradas sem alteração conservam o SI original, evitando uma edição causada somente por arredondamento binário na ida e volta da conversão. O arredondamento pertence à exibição; o CSV usa os valores convertidos sem esse arredondamento e identifica a unidade nos cabeçalhos. Com as preferências padrão, colunas, valores e metadados do CSV preservam o contrato anterior.

Z global é vertical positivo para cima. Momentos globais obedecem à regra da mão direita. A barra vai do nó inicial ao final. No plano XZ, a base local tem `u = (c, s)` e `w = (-s, c)`. A transformação de carga uniforme é explícita, `qu = c qX + s qZ`, `qw = -s qX + c qZ`, enviada com `csType 1`.

Os esforços locais de extremidade `[Fu1,Fw1,My1,Fu2,Fw2,My2]` são convertidos em esforços de seção: início `N=-Fu1, V=Fw1, M=My1`, fim `N=Fu2, V=-Fw2, M=-My2`. A interpretação positiva de momento sagente vale para uma viga horizontal orientada em +X. Inverter o sentido da barra exige interpretar sua base local.

No espaço, x local vai do início ao fim. A projeção de Z global no plano normal à barra define z local antes da rotação da seção. Para barras verticais ou quase verticais, usa-se X global como referência. A largura da seção acompanha y local, e a altura acompanha z local. A rotação é positiva pela regra da mão direita em torno de x local. As cargas distribuídas são projetadas nessa base ortonormal.

Os esforços espaciais `N, Vy, Vz, Mx, My, Mz` são resultantes na face de corte com normal +x local. Usa-se o oposto da ação na extremidade inicial e o valor da ação na final. N positivo representa tração. As reações e deslocamentos são globais. Os diagramas 2D mostram a ordenada do componente escolhido perpendicular à barra no plano em tela.

O adaptador, o inspetor e as vistas usam `beamAxes` de `src/domain/geometry.ts`. No plano, y local é +Y global. Na perspectiva, pontos e vetores passam de (X, Y, Z) para (X, Z, −Y), preservando a orientação da tríade. A projeção de uma carga global nos eixos locais é o produto escalar com cada vetor unitário.

Ao inverter i e j em XYZ, o programa troca o sinal da rotação em torno de x e mantém z local na mesma direção global. x e y locais mudam de sentido. A nova face +x é a antiga face −x. Ao comparar na mesma posição física, N, Vy, Mx e My conservam o sinal, enquanto Vz e Mz o invertem. Em XZ, x e z locais mudam de sentido e y continua em +Y. Com a convenção de `Beam2d`, N e V conservam o sinal e M o inverte. Em ambos, `x/L` passa a `1 − x/L` e os lados i/j de uma seção interna se trocam. A incidência da malha permanece vinculada ao nó físico. As cargas uniformes continuam armazenadas nos eixos globais.

As tabelas apresentam estações da malha. Deformadas e diagramas são linhas interpoladas entre estas estações, sem pretensão de avaliar extremos exatos entre elas.

### Referencial dos apoios

O v11 inclui `supportFrame` opcional em cada nó. A migração do v10 preserva os vínculos globais e os IDs. Em XZ, o referencial guarda o ângulo θ da tangente a partir de +X para +Z. A base é x′ = (cos θ, 0, sen θ), y′ = (0, 1, 0) e z′ = (−sen θ, 0, cos θ). Em XYZ, o projeto guarda duas direções, normaliza x′ e recompõe z′ pelo produto vetorial e y′ por z′ × x′. As flags de `restraints` correspondem aos eixos do referencial do nó. A base da barra é independente.

O adaptador envia x′ e y′ como `lcs 6` no registro `Node`. Os vínculos usam os graus locais, e `NodalLoad` usa `cstype 0` em nós orientados para que o OOFEM projete as componentes globais. O parser recompõe as translações, rotações, forças e momentos globais antes de verificar equilíbrio e montar deformadas e combinações. A tabela e o CSV obtêm as componentes locais projetando as reações globais no mesmo referencial. O pré-processador examina movimento de corpo rígido por componente. Uma restrição de translação na direção unitária a, aplicada a um nó de posição relativa r, gera a linha (a, r × a), e uma restrição de rotação gera (0, a). No plano, usam-se apenas UX, UZ e RY.

Na laje, a pressão pZ é armazenada em N/m² em cada padrão de carga. A interface exibe pZ em kN/m², UZ na unidade de deslocamento selecionada (mm por padrão) e os momentos Mx e My na unidade de momento selecionada por metro de largura (kN·m/m por padrão). Os eixos locais do painel coincidem com X e Y globais. Mx positivo representa tração na face inferior na direção X, e My positivo representa tração na face inferior na direção Y. Os mapas usam a média por elemento. A consulta central usa os deslocamentos nodais e os momentos recuperados nos vértices.

### Molas nodais de pórtico

O v14 acrescenta `node.springs`, um mapa opcional de rigidezes escalares na base `supportFrame`. A migração de v13 mantém os IDs e vínculos rígidos. Em cada direção, uma flag em `restraints` indica vínculo rígido, k positivo indica mola linear, e ausência das duas indica grau livre. As unidades internas são N/m e N·m/rad. As linhas do teste de movimento de corpo rígido representam tanto vínculos prescritos quanto direções de mola com k positivo.

O OOFEM 3.0 usa `Spring` com direção explícita e um nó de solo auxiliar fixo. Os modos 2 e 3 representam translação em XZ e rotação em Y. Os modos 4 e 5 representam translação e rotação ao longo de qualquer eixo no espaço. As reações elásticas são −k·u a partir do deslocamento impresso na base do nó e entram no equilíbrio em eixos globais. As reações prescritas vêm da tabela do OOFEM para as direções rígidas. O nó de solo é interno à entrada do solver. [Implementação de Spring no OOFEM 3.0](https://github.com/oofem/oofem/blob/v3.0/src/sm/Elements/springelement.C)

## Consistência

- O formato v7 guarda os grupos nomeados como conjuntos explícitos de pares tipo/ID. Ao migrar um arquivo anterior, mantém as associações válidas de grupos existentes ou cria uma lista vazia. A seleção transitória pertence à interface. Excluir uma peça limpa suas associações no mesmo passo do histórico.
- Um objeto de projeto validado é a única fonte de verdade das vistas e propriedades.
- Os resultados de casos estáticos ficam em memória por ID do caso durante a revisão atual. A combinação usa esses resultados, alinhando apoios e nós por ID e esforços por barra e posição na malha. Parcelas com fator zero dispensam uma análise do caso correspondente.
- A fila de análise resolve as dependências do resultado selecionado, deduplica os IDs e ordena os casos pela lista do projeto. Cada execução usa a ponte nativa de um caso e pode publicar seu resultado individual na revisão atual. Cancelar ou falhar interrompe a fila. A próxima solicitação consulta novamente o cache da revisão. O histórico registra cada execução nativa pelo ID da execução e pelo nome do caso.
- O envelope compara as combinações escolhidas em cada estação e preserva o vetor inteiro de esforços da combinação que gera cada mínimo ou máximo. Empates usam a ordem de seleção das combinações. A interface cancela o cálculo do envelope quando muda a revisão ou a definição consultada.
- A consulta de barra usa `memberId`, a posição normalizada no comprimento deformável e a face da seção. O adaptador conserva em memória as intensidades locais nas duas pontas de cada elemento que enviou ao OOFEM, com os fatores do caso aplicados. `memberDiagram.ts` superpõe essas intensidades e os esforços nativos de cada origem. A consulta e a busca usam as leis por trecho, respeitam os pares lado i/lado j e avaliam cada combinação na posição consultada antes de escolher a governante. O cursor e a tabela compartilham a revisão e a posição física.
- Para cada combinação linear, as reações e os deslocamentos são somados por ID do nó físico. O envelope compara os vetores globais e, em nós com referencial de apoio, também os vetores projetados nessa base. Cada extremo aponta para um único vetor com sua combinação, parcelas e referencial. Casos ausentes, identidades incompatíveis e componentes não finitas impedem a publicação do envelope. As abas nodais usam a revisão do modelo e o mesmo cache dos esforços nas barras.
- O CSV registra os IDs e nomes de origem. Para combinações e envelopes, registra também os casos e fatores da composição governante. Os arquivos de projeto armazenam as definições de carga, combinação e envelope.
- Edição, desfazer, refazer e substituir o projeto avançam a revisão e invalidam todos os resultados. A resposta de uma análise em andamento é aceita apenas na revisão em que foi solicitada.
- Arquivos não podem configurar executáveis nem introduzir comandos. A seleção do OOFEM fica nas preferências locais.
- O runner usa argumentos separados, sem shell, um diretório temporário por execução, prazo de 60 s e limite de 32 MB por saída. Encerra e aguarda o processo em cancelamentos e ao atingir o prazo.
- O Tauri reserva a execução antes de habilitar o cancelamento e publica o resultado em um canal IPC. Os registros locais têm escrita atômica e retenção de 30 execuções.
- Pacotes desktop usam o OOFEM integrado com manifesto e conferência de SHA-256. O caminho explícito nas preferências permite outro executável. A distribuição e seu autoteste estão descritos em [DISTRIBUTION.md](DISTRIBUTION.md).
- O parser exige término, passo único, deslocamentos e esforços completos, reações dos vínculos e equilíbrio global. Erros não geram resultados parciais.
- **Conexões da malha** liga um nó existente ao interior de uma barra ou um par de barras que se cruzam em XYZ. Um cruzamento apenas em projeção permanece independente. A camada **Malha de análise** identifica as estações de refinamento e destaca as incidências confirmadas.
- Desconectar remove só a incidência escolhida e conserva o nó e suas atribuições. Um nó isolado aparece no diagnóstico antes da análise. Excluir um nó ou uma barra limpa suas incidências na mesma edição. Mover um nó ao longo da barra ou alterar uma extremidade recalcula x/L. Para afastar o nó do eixo ou encurtar a barra além dele, desconecte-o primeiro. Transformar a barra leva os seus nós internos junto, e uma cópia registra as incidências da nova barra. Dividir fisicamente redistribui incidências pelos trechos. No próprio ponto do corte, o nó vira extremidade compartilhada. O refinamento mantém os IDs, conexões e seleção. Edições, desfazer e refazer invalidam os resultados.

### Edição das barras físicas

Dividir mantém o ID da barra no trecho que parte de i e copia para cada trecho as cargas uniformes de cada padrão. Grupos que continham a peça passam a conter os trechos. Unir exige nós compartilhados por ID em uma cadeia colinear, seção, orientação física e intensidades globais compatíveis em cada padrão. A primeira barra da cadeia na ordem do projeto conserva ID e sentido independentemente da ordem de seleção. Os grupos passam a referenciar essa barra uma única vez. Os nós intermediários removidos saem dos grupos.

Aparar e prolongar verificam a ponta antes de alterar sua posição. Um apoio, carga nodal ou barra externa incidente bloqueia a remoção ou o deslocamento desse nó. Se já existe um nó no destino, a ligação e os grupos usam seu ID. Barras que passam pelo interior do ponto de corte são subdivididas no mesmo nó. Uma referência por barra usa a interseção em XYZ com o segmento escolhido. As quatro operações editam o modelo físico. A malha do OOFEM continua derivada na exportação.

## Referências técnicas do adaptador

- [OOFEM Beam2d 3.0](https://github.com/oofem/oofem/blob/v3.0/src/sm/Elements/Beams/beam2d.C)
- [Caso oficial beam2d_1](https://github.com/oofem/oofem/blob/v3.0/tests/sm/beam2d_1.in)
- [OOFEM Beam3d 3.0](https://github.com/oofem/oofem/blob/v3.0/src/sm/Elements/Beams/beam3d.C)
- [Caso oficial beam3d_1](https://github.com/oofem/oofem/blob/v3.0/tests/sm/beam3d_1.in)
- [Comandos Rust no Tauri](https://v2.tauri.app/develop/calling-rust/)

Trabalho bloqueante fica em `spawn_blocking`, preservando a responsividade da janela.

## Eixo de inserção e trechos rígidos de barras

O formato v12 guarda em `member.offsets.i` e `j` o vetor `eccentricity` em XYZ global e o comprimento `rigidLength`, ambos em metros. Y vale zero em XZ. A migração de v11 conserva todos os IDs e usa barras centradas. Os valores nulos equivalem à ausência de `offsets`. O inspetor usa a preferência de comprimento do usuário.

Em cada ponta, o eixo começa em **nó + excentricidade**. Os comprimentos rígidos são medidos para dentro desse eixo. As duas faces delimitam o comprimento deformável e correspondem a x/L = 0 e 1. `memberAxis` fornece essa geometria para a malha, as vistas e os resultados. A inversão troca i e j mantendo os vetores globais. A divisão no trecho deformável interpola as excentricidades no corte e conserva os trechos rígidos nas pontas externas. Um corte que deixaria uma barra inteiramente rígida é recusado. A conexão de malha permite vincular um nó dentro do trecho rígido.

O adaptador gera elementos Beam2d ou Beam3d entre as faces deformáveis. O RigidArmNode do OOFEM 3.0 impõe o movimento de corpo rígido entre cada nó de lançamento e sua face. Para um braço **r** do nó até a face, **u** da face é **u** do nó mais **θ × r**. Uma força **F** na face equivale a **F** e **r × F** no nó. As cargas nodais e as reações são referidas aos nós editáveis. A carga distribuída global é por metro de todo o eixo de inserção. Cada trecho rígido transmite a sua resultante aplicada no ponto médio, e a parte flexível recebe a carga distribuída diretamente.

Cada barra também pode definir ligações independentes nas pontas físicas i e j. Campos ausentes continuam rígidos para preservar projetos existentes. A malha acrescenta um nó auxiliar por ponta não rígida. Componentes rígidas transferem o movimento do nó de lançamento, componentes livres permanecem independentes e componentes elásticas recebem mola local. Ao dividir ou inverter a barra, as definições continuam associadas às pontas físicas. Graus sem rigidez só são incluídos no sistema quando usados por vínculos, cargas, molas ou outras barras, evitando modos nulos inativos sem ocultar mecanismos carregados.

Cada grupo de nós unidos por trechos rígidos compartilha um movimento. Vínculos independentes em nós distintos conservam suas reações nos pontos originais por equações de compatibilidade. Vínculos redundantes no mesmo corpo rígido recebem diagnóstico de reações individuais indeterminadas. A saída verifica o movimento dos braços e o equilíbrio global. As estações, os diagramas e as tabelas e CSV de esforços e envelopes se referem às seções do trecho deformável. A tabela de deslocamentos também permite consultar os próprios nós de lançamento.

[Implementação do RigidArmNode no OOFEM 3.0](https://github.com/oofem/oofem/blob/v3.0/src/core/rigidarmnode.C)

## Diafragmas de pavimento

O formato v15 acrescenta a lista opcional `diaphragms`. Cada vínculo espacial associa um ID e um nome ao pavimento, aos IDs dos nós participantes e a uma referência XY em metros. Projetos v14 migram com as mesmas propriedades e IDs. A cota Z vem do pavimento. Editar a geometria exige conservar a coplanaridade. Ao unir nós duplicados, o vínculo acompanha o ID sobrevivente. A referência se mantém até uma edição explícita.

Para um modelo `Beam3d`, o nó físico tem seis graus. O diafragma impõe `ux = Ux − θz·(y−y0)`, `uy = Uy + θz·(x−x0)` e `rz = θz`. O giro em torno da normal (rotação de furação do piso) acompanha a rotação do pórtico no plano. UZ, RX e RY pertencem a cada participante. O painel isolado DKT/QDKT usa outro fluxo de análise. O vínculo de piso aplica-se aos nós espaciais do projeto.

Na exportação, um nó auxiliar reúne UX, UY e RZ na referência. Os outros três graus desse nó são prescritos em zero. O `RigidArmNode` usa a geometria em precisão real e uma máscara que seleciona os graus ligados. Para um apoio prescrito, referencial local ou trecho rígido, o adaptador escreve as compatibilidades necessárias com `LinearConstraintBC` nos graus primários, projetando direções e braços em suas bases. A escala em µm ou µrad melhora o condicionamento do sistema com multiplicadores. As cargas continuam nos pontos físicos e o solver transfere a força e o momento à referência. Na leitura, o adaptador confere a cinemática, as reações e o equilíbrio global antes de associar os deslocamentos aos IDs editáveis. [RigidArmNode na versão fixada](https://github.com/oofem/oofem/blob/214b161ed3acb471f2d0104b004c37fd73bafaa2/src/core/rigidarmnode.C) · [LinearConstraintBC](https://github.com/oofem/oofem/blob/214b161ed3acb471f2d0104b004c37fd73bafaa2/src/core/linearconstraintbc.C)

A validação identifica vínculos repetidos e apoios rígidos redundantes pela independência das equações. Para verificar estabilidade, cada componente conectado por barras retém seus seis movimentos de corpo rígido, e cada diafragma fornece três equações por participante. Assim também se detecta uma componente que pode se mover ou inclinar fora do plano, mesmo quando a estrutura está estável na horizontal.

## Fundações do MolaStruct

No formato v16, `nodes[].foundation` armazena a matriz na origem de importação, na ordem UX/UY/UZ/RX/RY/RZ e em SI, o nome da fundação e do arquivo, os metadados e os GDL livres declarados. O referencial é o `supportFrame` do nó (ausente para eixos globais). O vetor `offset` em metros aponta do nó à origem do CSV e é expresso nos eixos da fundação. Uma cópia espelhada guarda a paridade da transformação e conserva as entradas originais do CSV. O modelo v15 migra preservando as propriedades e os IDs. A reabertura e a análise usam os dados do projeto.

O importador identifica cada coluna de movimento e cada linha de ação pela legenda. A validação de energia e a transformação por trabalho virtual estão em `src/domain/foundation.ts`. O adaptador usa vínculos cinemáticos internos e molas escalares do OOFEM 3.0 para montar todos os termos da matriz. Os nós auxiliares pertencem apenas à entrada do solver. As tabelas e os CSVs de resultados referem movimentos e reações ao nó de lançamento.

## Cargas concentradas em barras

No formato v17, cada padrão pode ter uma lista `points`. Cada ação tem ID próprio, ID da barra física, tipo (força ou momento), referencial, três componentes em N ou N·m e posição a partir de i. A posição guarda a distância em metros ou a fração do comprimento do eixo de inserção. Ao reabrir um projeto v16, as ações existentes e seus IDs são preservados. No plano XZ estão disponíveis FX, FZ e MY. No espaço, a base local acompanha o eixo de inserção e a rotação da seção.

A malha combina as posições de todos os padrões antes de resolver cada caso. Uma posição a até 10⁻⁶ m de um nó conectado ou de uma estação de carga compartilha essa estação. Um nó de modelagem nessa posição participa da barra quando há uma conexão explícita. O refinamento regular completa a malha. Nas extremidades, a ação é aplicada uma vez. Uma posição fora da barra é rejeitada. Nos trechos rígidos, a força é transferida à face com o momento equivalente `r × F`. O adaptador usa `NodalLoad` e o fator do padrão. O equilíbrio é conferido na posição física original.

As duas seções no ponto interno são armazenadas na ordem de i para j. O lado i corresponde ao limite vindo de i e o lado j ao limite vindo de j. A tabela, o CSV e as combinações conservam esses identificadores. Inverter a barra preserva a posição e o vetor global da ação. Na divisão física, cada carga passa a uma única barra filha. Uma ação exatamente no corte pertence à extremidade i da filha seguinte.

## Cargas distribuídas em trechos de barra

O formato v18 acrescenta a lista opcional `distributed` a cada padrão. A carga referencia a barra por ID e guarda o referencial, as posições a partir de i no eixo de inserção (ambas em metros ou ambas relativas a L) e os vetores de intensidade em N/m nas duas pontas. Os registros `uniform` existentes seguem o adaptador original. A migração de v17 conserva os IDs, as cargas e os casos. As ações de vários padrões somam-se pelos fatores do caso.

A malha comum aos casos incorpora os limites de cada trecho e as mudanças de sinal das componentes especificadas. Uma mudança de intensidade distribuída conserva a continuidade dos esforços de seção. A divisão física interpola a intensidade no corte, mantém o ID na primeira parte carregada e atribui novos IDs às partes seguintes. Na inversão da barra, as extremidades e os vetores locais são remapeados para a mesma distribuição no espaço.

Em cada elemento, o adaptador soma os perfis lineares ativos e fornece as duas intensidades ao `LinearEdgeLoad` do OOFEM, no referencial local do elemento. A carga de borda usa a aresta 1, `loadType 3`, `csType 1` e os GDL 1/3/5 no plano ou 1 a 6 no espaço. Os componentes são agrupados por extremidade. Nas partes rígidas, as forças equivalentes nas pontas do intervalo são `L(2q₀ + q₁)/6` e `L(q₀ + 2q₁)/6`. Cada uma é transportada até o nó com seu próprio braço. A verificação de equilíbrio integra a distribuição original em relação ao ponto médio e inclui o binário livre. [Implementação do LinearEdgeLoad no OOFEM 3.0](https://github.com/oofem/oofem/blob/v3.0/src/core/linearedgeload.C)

## Movimentos prescritos nos apoios

Cada padrão pode guardar `prescribed` com o ID do nó, o grau de liberdade e o valor assinado em metros ou radianos na base do apoio. A migração de v18 mantém as atribuições existentes. Um grau rígido sem atribuição recebe zero. Cada direção admite uma prescrição por padrão. Liberar o grau exige retirar antes as prescrições nele existentes.

O adaptador soma os movimentos pelos fatores do caso e escreve um único `BoundaryCondition` por nó com restrições. A mesma base local define a ordem dos graus e os valores lidos da saída. O pós-processador confere cada deslocamento restringido e transforma as componentes em globais. As combinações tomam a soma ponderada dos movimentos dos casos. A tabela e o CSV exibem as componentes calculadas e as impostas no apoio. Células vazias identificam graus livres e estações internas.

### Diagnósticos de análise

As mensagens verificáveis antes da execução carregam etapa, severidade e referências por ID físico. Quando a análise de apoios insuficientes identifica um componente ligado, o diagnóstico seleciona somente seus nós e barras. Um log genérico de singularidade mantém o texto bruto do OOFEM e recomenda inspeção sem escolher uma peça arbitrária. Contextos de falha no histórico guardam o projeto serializado da execução; a navegação fica desativada se o projeto aberto não corresponder àquela revisão.

## Peso próprio por padrão

O formato v20 guarda a habilitação, direção global, gravidade e multiplicador de `selfWeight`. A migração de v19 inicia o peso próprio desativado e preserva as ações existentes. As barras usam a massa específica, a área bruta e o comprimento do eixo de inserção, inclusive com modificadores de rigidez ou braços rígidos. A montagem de cargas uniformes e a verificação do equilíbrio recebem as mesmas intensidades. O painel horizontal usa massa específica × espessura × aceleração vertical. Fatores nulos retiram toda a contribuição do padrão.

## Ações de vento

Desde o formato v21, cada padrão pode guardar faixas de vento com ID próprio, nós inferior e superior, largura em metros, intervalo relativo à altura, azimute em graus, pressão de referência em Pa e coeficiente com sinal. Um arquivo v20 abre com as mesmas cargas e sem faixas geradas. As parcelas nodais são derivadas dessa definição e da geometria atual, tanto nas vistas quanto na montagem do caso e na conferência do equilíbrio. Uma edição de faixa preserva as cargas manuais e os outros geradores do padrão.

## Ação térmica em barras

No formato v22, cada padrão pode guardar um campo `thermal` por barra física. `uniform` é a variação média em K. `deltaZ` e `deltaY` são as diferenças T(face positiva) − T(face negativa) entre as fibras extremas da seção. O plano XZ admite apenas a diferença em z local. A migração de v21 preserva as faixas de vento, os IDs e os demais valores e inicia os projetos sem temperatura aplicada.

O campo é constante ao longo do comprimento deformável e varia linearmente na seção homogênea. A altura em z e a largura em y usam as dimensões externas, inclusive o diâmetro externo de tubos. A rotação da seção orienta os gradientes. A inversão i/j e as operações de cópia e espelhamento transformam os componentes para conservar a face física correspondente. A divisão leva o campo a cada trecho. A união exige que os campos coincidam no mesmo referencial. Os braços rígidos conservam a cinemática de corpo rígido.

No adaptador, os fatores dos padrões ponderam as três temperaturas antes de emitir um `StructTemperatureLoad` sobre o conjunto dos elementos da barra. `SimpleCS` recebe as dimensões físicas, inclusive quando os modificadores mudam a rigidez. Para `Beam2d` as componentes são `uniform deltaZ`. Para `Beam3d` são `uniform deltaZ -deltaY`, segundo a convenção de curvatura do solver. `IsoLE` fornece α. Um campo resultante nulo ou α igual a zero dispensa o registro de temperatura. Os deslocamentos, reações e esforços provêm do OOFEM.

[Registro de temperatura no OOFEM 3.0](https://github.com/oofem/oofem/blob/v3.0/src/sm/Loads/structtemperatureload.C) · [Uso das dimensões e sinais em SimpleCS](https://github.com/oofem/oofem/blob/v3.0/src/sm/CrossSections/simplecrosssection.C)

## Famílias de combinações ELU/ELS

O formato v23 acrescenta a configuração opcional `combinationProfile`. Cada ação selecionada referencia um caso estático por ID e tem classificação e grupo de exclusão. Cada família possui ID próprio, tipo ELU ou ELS, nome, origem dos fatores e três coeficientes adimensionais definidos pelo usuário. O gerador trabalha com combinações lineares de pórticos. A migração de v22 conserva padrões, casos, combinações manuais, IDs e envelopes.

O gerador toma uma alternativa de cada grupo de exclusão e alterna as variáveis ativas como principais. As outras variáveis da alternativa são acompanhantes. Sem variáveis, propõe uma expressão de ações permanentes. A prévia expande os casos nos padrões efetivamente aplicados, verifica referências e superposições e confronta as expressões com as combinações existentes. A comparação de equivalência entre padrões usa 15 algarismos significativos para absorver diferenças de representação decimal. Os fatores salvos e usados na análise conservam a precisão original. O projeto aceita 100 combinações, e uma prévia comporta até 500 propostas para revisão.

Cada saída aceita é uma combinação linear comum de casos. O campo opcional `generation` registra a família, a ação principal, as alternativas dos demais grupos, a origem dos coeficientes e a última fórmula proposta. A identificação usa IDs de família e de casos, inclusive quando nomes ou fatores mudam. A comparação entre a expressão salva e a proposta anterior identifica edições do projetista. A prévia conserva a linha editada e permite restaurar a nova proposta explicitamente. Linhas dispensadas, combinações manuais e linhas de gerações anteriores fora da prévia continuam como estavam. Uma linha nova dispensada pode voltar a ser sugerida na próxima geração.

O editor confirma a configuração e as combinações na mesma transação do histórico. A fila e o cálculo dos envelopes consomem as parcelas por ID e usam os resultados da revisão vigente. A consulta de lajes isoladas continua por caso estático.


## Painéis em planos arbitrários

No esquema v28, `surfacePanels` identifica os painéis por ID físico. Cada um tem três vértices globais em metros, espessura, material e duas subdivisões. A migração de v27 conserva os objetos de pavimento, inclusive os vínculos de borda. Cada padrão pode associar ao painel uma pressão em Pa e uma carga de linha em N/m nos eixos locais. O peso próprio acompanha o vetor de gravidade global.

O eixo 1 segue AB, o eixo 3 segue o produto vetorial AB × AD e o eixo 2 é 3 × 1. O OOFEM resolve triângulos Allman 3D para membrana, DKT 3D para placa e TR_SHELL02 para a resposta combinada. As duas malhas compatíveis recebem os mesmos índices nodais apenas na aresta comum. A união das direções ativas de cada elemento define quais translações e rotações entram na rigidez de cada nó. As direções sem rigidez são eliminadas na base nodal. Antes da execução, um teste cinemático verifica se os graus transmitidos pela borda efetivamente impedem o movimento de corpo rígido do painel livre.

A integração de tração de borda e de carga uniforme de área inclui os pares de momentos nodais conjugados à rotação normal da membrana de Allman. Para um segmento de vetor Δr, normal unitária n, carga vetorial q e comprimento ℓ, o par escalar é ± q · (n × Δr) ℓ/12. Para a integral no triângulo usa-se a contribuição de cada lado com área/24. Essas parcelas decorrem do trabalho virtual da interpolação quadrática e se cancelam como binário externo do par. Sua inclusão permite reproduzir o campo constante de tração.

O pós-processamento transforma os deslocamentos e reações da base nodal para XYZ. Projeta os tensores simétricos globais nos eixos ortonormais físicos do painel em cada ponto de integração. No OOFEM 3.0, as componentes no plano do registro `stresses` de Allman estão em Pa. A multiplicação pela espessura produz N11, N22 e N12 em N/m. Os momentos já têm unidade N·m/m. A conferência do equilíbrio usa as reações dos engastes e a integral independente das ações em relação a A do primeiro painel. [Caso de referência do OOFEM](https://github.com/oofem/oofem/blob/v3.0/tests/sm/trshell02_test.in) · [Interpolação de Allman](https://github.com/oofem/oofem/blob/v3.0/src/sm/Elements/PlaneStress/trplanestressrotallman.C)

## Orientação e rigidez dos painéis espaciais

A v29 acrescenta `angleDeg` e `stiffness` opcionais a `surfacePanels`. Um painel v28 abre com ângulo zero e fatores unitários. A direção geométrica 1 acompanha AB. A normal +3 acompanha AB × AD e aponta para a face positiva. A direção resistente 1 gira a partir de AB em direção à direção geométrica 2, com ângulo positivo anti-horário visto da face +3. A direção resistente 2 completa o triedro. Apoios, malha e cargas de borda continuam referenciados à geometria. A pressão normal segue +3 e o peso próprio segue a gravidade global.

| Formulação | Fatores adimensionais positivos | Resposta |
| --- | --- | --- |
| Membrana | N11, N22, N12 | Extensão nas direções 1 e 2 e cisalhamento no plano |
| Placa em flexão | M11, M22, M12 | Flexão nas direções 1 e 2 e torção da placa |
| Casca | As duas famílias acima | Membrana e flexão independentes sobre a mesma superfície média |

Para cada família, sejam $f_1$, $f_2$ e $f_{12}$ os três fatores e $Q_0=E/(1-ν^2)$. No referencial resistente, $Q_{11}=f_1Q_0$, $Q_{22}=f_2Q_0$, $Q_{12}=νQ_0\sqrt{f_1f_2}$ e $Q_{66}=f_{12}E/[2(1+ν)]$. A média geométrica no termo de Poisson preserva a simetria e a energia positiva. A membrana usa $A=hQ$ e a placa usa $D=h^3Q/12$ com seus respectivos fatores. O modelo é linear elástico, com superfície média homogênea, acoplamento membrana–flexão nulo e sem ajuste independente de cisalhamento transversal.

O adaptador conserva a formulação isotrópica original quando todos os fatores valem um. Para membrana direcional usa Allman 3D com `OrthoLE`. Para flexão direcional usa DKT 3D com `AnisoLE` e `LayeredCS` homogênea, com dois pontos de Gauss na espessura. A transformação da rigidez para os eixos de cada triângulo inclui os termos de flexão–torção que surgem fora das direções principais. Na casca modificada, Allman e DKT compartilham os mesmos nós. As cargas e o peso próprio entram uma vez por painel físico. A saída reúne membrana e momentos por triângulo físico e ponto de integração e permite projetá-los nos dois referenciais.

## Cargas superficiais variáveis

A v30 admite uma direção e uma distribuição por painel e por padrão. Arquivos v29 conservam a pressão uniforme com sinal, em Pa, na normal geométrica para painéis espaciais e em Z para lajes de pavimento. O editor apresenta kN/m² por **área real da superfície**. A direção normal acompanha AB × AD, com sinal positivo para a face +3. As direções globais X, Y e Z acompanham o modelo, inclusive nas superfícies inclinadas. A rotação dos eixos resistentes altera a rigidez. A direção física da carga permanece vinculada à geometria ou ao eixo global escolhido.

- **Uniforme.** Uma intensidade em todo o painel. Membranas aceitam cargas no plano, placas aceitam a direção normal e cascas aceitam ambas as componentes. Na laje horizontal, a normal e o eixo Z coincidem.
- **Por cota.** Dois pares (Z, p) definem uma variação linear. As cotas são globais. Abaixo da cota inferior vale a primeira pressão e acima da superior vale a segunda. Uma extremidade com zero permite modelar a parte seca de uma parede. Uma laje horizontal recebe a intensidade da sua cota.
- **Por vértice.** Em um paralelogramo a pressão é bilinear nas coordenadas da superfície definidas por AB e AD. A ordem é A, B, C, D. Nas lajes poligonais cada vértice do contorno externo e de cada abertura tem uma intensidade. A interpolação é linear em cada triângulo da triangulação original. Refino e conformação da borda comum preservam essa distribuição. Um vértice inserido numa borda ou numa nova abertura recebe a intensidade interpolada naquele ponto.

Nos triângulos, o adaptador integra as funções de forma lineares contra a pressão. Para uma carga no plano, integra também o termo quadrático das rotações de furação do Allman. Os elementos que atravessam uma cota de mudança de inclinação são divididos para a integração, conservando os nós do modelo. A quadratura triangular de grau quatro cobre o produto da pressão bilinear pela função quadrática. Nos quadriláteros QDKT, as pressões variáveis usam as funções bilineares do elemento e a quadratura 2 × 2. A pressão uniforme do QDKT continua pela carga de superfície nativa.

Os casos somam os padrões com seus fatores e acrescentam o peso próprio e as cargas de borda. A verificação usa a força e o primeiro momento da distribuição. Cargas com sinais contrários podem gerar um binário mesmo com resultante nula. O ponto A do primeiro painel espacial é a origem dos momentos exibidos. [Verificações numéricas](VALIDATION.md#ks-46--pressão-hidrostática-e-carga-superficial-variável)

## Painéis de carga sobre vigas

Um painel descreve um retângulo horizontal, definido pelos nós editáveis A, B e D do pórtico espacial. Os lados AB e AD são perpendiculares e o quarto canto é C = B + D − A. A orientação em planta é livre. O arquivo v31 guarda a geometria e o modo de distribuição em `loadPanels`. Cada padrão pode guardar em `tributaryLoads` uma intensidade uniforme com sinal (Pa por área em planta) e um eixo global X, Y ou Z. A geometria tem massa e rigidez nulas. Projetos anteriores abrem com as cargas de barra e de superfície que já possuíam.

| Transferência | Bordas receptoras | Largura de influência |
| --- | --- | --- |
| Uma direção, vão AB | BC e DA | Metade do comprimento AB |
| Uma direção, vão AD | AB e CD | Metade do comprimento AD |
| Duas direções | AB, BC, CD e DA | Bissetrizes a 45° entre bordas adjacentes |

Na distribuição em duas direções, para uma borda de comprimento $L$ separada da oposta por $H$, a largura a uma distância $s$ da extremidade é $b(s)=\min(s,L-s,H/2)$. A intensidade na viga é $q(s)=p\,b(s)$. Essa hipótese geométrica produz triângulos nas bordas curtas e trapézios nas longas, independentemente da rigidez das vigas. Para calcular esforços internos e flechas da própria laje, use os elementos resistentes de placa ou casca.

A atribuição compara cada borda receptora com o eixo de inserção das barras físicas, na mesma cota. Barras contínuas podem ultrapassar os cantos, e várias barras colineares podem completar uma borda. Cada parcela é recortada no intervalo da respectiva barra e orientada a partir de i. Lacunas e duas barras cobrindo o mesmo trecho impedem a aplicação. Painéis adjacentes somam suas cargas numa viga comum. Há bloqueio quando as áreas de material de dois painéis, ou de um painel e uma laje resistente, se sobrepõem na mesma cota. Aberturas, bordas compartilhadas e outros pavimentos são considerados na verificação.

Os perfis lineares são gerados na exportação e compartilham a rotina de cargas por trecho com as ações manuais. As mudanças de inclinação entram na malha de todos os casos. As ações mantêm o padrão, o fator e o sinal ao passar para cada elemento e para os trechos rígidos. O balanço global usa separadamente a força $pA$ aplicada no centro do retângulo para verificar forças e momentos de reação. [Exemplo e verificações](VALIDATION.md#ks-47--distribuição-de-cargas-de-painel-às-vigas)

## Cortes da estrutura

O esquema v32 persiste em `sectionCuts` o ponto do plano, a normal, o semiespaço retido e o polo de redução, em coordenadas do projeto. A representação física independe dos números de elementos. A edição exclusiva dos cortes preserva a revisão dos resultados. Barras e superfícies são intersectadas novamente para cada geometria.

A consulta usa as estações do caso efetivamente resolvido e integra os tensores de membrana e flexão de cada elemento na sua própria base. A regra de Gauss de dois pontos integra ao longo de cada trecho, inclusive o braço das forças. O cortante transversal de Kirchhoff parte da divergência do tensor de momentos. Seu integral e seu primeiro momento no traço são equilibrados com as ações externas e as reações do OOFEM. Nas duas lajes, as ações de contato da viga entram no equilíbrio individual de cada painel. Nas cascas dobradas, o sistema de equilíbrio projeta o resíduo sobre as normais dos painéis e as conormais dos traços. Uma decomposição singular impede o total. O momento fletor em torno da linha do corte continua vindo da integração do tensor elementar.

O corpo retido inclui os pontos sobre o plano, dentro de 10⁻⁶ m. Em nó, salto ou aresta interna, a consulta usa a face adjacente ao lado descartado. Contato pontual é indicado como tangência. Coincidência com uma borda física, interface ou trecho de barra é indicada na prévia. Um trecho rígido com transferência nodal individual desconhecida também impede a soma. Os painéis tributários da KS-47 já contribuem pelas cargas das barras receptoras.


## Medidas de serviço

O formato v33 guarda as definições de consulta em `serviceMeasures`. A referência usa IDs dos nós ou da barra, eixo global e origem do resultado. Na corda, a posição é a fração do trecho deformável entre as faces i e j. Inverter a barra preserva a posição física pela transformação 1 − x/L. Se a barra, o nó ou a origem for removido, a definição fica disponível para correção. A migração de v32 preserva as definições existentes do projeto. Salvar uma medida altera somente os metadados de consulta e conserva os resultados da revisão em memória.

As translações entre estações usam interpolação axial linear e transversal cúbica com as rotações físicas correspondentes. A diferença, a flecha relativa e a razão da deriva são lineares para referências fixas. O envelope busca os extremos das medidas completas, guardando as parcelas simultâneas e a origem governante.
