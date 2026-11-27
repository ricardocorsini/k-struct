# Validação inicial

Os testes do domínio e do parser são executados por `npm run check`. Os testes de integração numérica só são executados quando `OOFEM_BIN` está definido. A ausência do binário produz testes explicitamente ignorados.

## Benchmarks analíticos

Unidades base N/m. E = 200 GPa, A = 0,03 m², IY = 0,0001 m⁴. O adaptador aproxima Euler–Bernoulli mediante rigidez elevada ao cisalhamento.

| Caso                                   | Referência                                                              |
| -------------------------------------- | ----------------------------------------------------------------------- |
| Viga biapoiada L = 6 m, q = 10 kN/m    | R = 30 kN em cada apoio, M(L/2) = 45 kN·m, UZ(L/2) = −8,4375 mm         |
| Mesma viga, fator de carga 2           | R, M e deslocamentos duplicados                                         |
| Balanço horizontal L = 6 m, PZ = −1 kN | UZ = −PL³/(3EI), M(0) = −6 kN·m                                         |
| Pilar vertical L = 6 m, qX = 1 kN/m    | UX = qL⁴/(8EI), RX = −6 kN, MY = −18 kN·m                               |
| Balanço inclinado 3–4–5, PX = 1 kN     | Transformação global das flexibilidades axial L/EA e transversal L³/3EI |

Em 19/11/2026, estes cinco testes passaram localmente contra o binário Linux do build de desenvolvimento `v3.0-437-gd77741577`, commit `d77741577040616bb6173dd22f3306f7dd7b3308`. O workflow numérico compila e testa separadamente a tag exata 3.0. Consulte o estado do workflow para confirmar o resultado na revisão atual.

O caso vertical detectou a necessidade de transformação explícita das cargas distribuídas para a base local. O adaptador envia `csType 1` e não depende da rotação implícita do vetor de carga de Beam2d.

Os cinco benchmarks também passaram contra a tag exata 3.0 no [primeiro workflow numérico](https://github.com/ricardocorsini/k-struct/actions/runs/44565642421). A mesma execução confirmou o `cargo check` do aplicativo no Windows. A verificação atual é sempre a CI do commit em uso.

## Preferências de unidades (KS-05)

Os testes de `units.test.ts` verificam ida e volta de cada grandeza, leitura com ponto ou vírgula, preferências inválidas e preservação exata de entradas sem mudança. A viga de referência conserva 6 m ao apresentar 600 cm ou 6000 mm e 200 GPa ao apresentar 200000 MPa. A reação de 30000 N corresponde a 30 kN; a flecha de −0,0084375 m corresponde a −8,4375 mm.

`result-units.test.ts` verifica valores e cabeçalhos nas unidades selecionadas e hashes de regressão do CSV padrão de reações, deslocamentos, esforços e envelopes. IDs, estações e composição dos resultados permanecem rastreáveis. A cobertura inclui as reações globais e no referencial do apoio e os lados i/j nas conexões internas. Os testes usam a saída de referência do OOFEM, sem substituir o solver da aplicação.

Os cenários de navegador em `units.spec.ts` cobrem resultado válido durante trocas sucessivas, mesma geometria de deformada, modelo e entrada OOFEM idênticos, retorno ao CSV padrão, edição em centímetros, preferência após recarregar, cancelamento e histórico da tabela. Conferem também área e inércia em metros sem arredondá-las para zero. O cenário em `units-views-integration.spec.ts` confere os valores i/j em N e N·m e a geometria do diagrama ao trocar unidades. `template-units.spec.ts` compara entradas e prévias em cm/mm com a geometria SI gerada, inclusive vírgula decimal, tolerância e cancelamento. Quando `OOFEM_BIN` está definido, o cenário de resultados produz a saída da viga com o executável real antes de exercitar a fronteira IPC no navegador.

O benchmark numérico continua sendo executado separadamente com o OOFEM 3.0 fixado em `crates/solver-runner/oofem.json`. Esta contribuição não altera equações, convenções de sinais nem o esquema do projeto. A reabertura do aplicativo conserva o modelo e a preferência; os resultados continuam pertencendo à sessão de análise, conforme o contrato existente.

## Verificações adicionais

Persistência sem perda, rejeição de versões desconhecidas e referências quebradas, remoção de cargas dependentes, desfazer/refazer, identidade de nós no snap, componentes sem restrições suficientes, Y não nulo, nós isolados no interior das barras, mapeamento determinístico e saída truncada.

A soma global de forças e momentos é conferida com tolerância relativa de 0,1% à soma dos módulos das contribuições (mais escala unitária). A saída textual do OOFEM usa precisão menor para esforços que para deslocamentos. Equilíbrio é uma verificação complementar e não substitui benchmarks de rigidez nem análise de convergência.

Uma saída real capturada também testa renderização e descarte de resultados obsoletos substituindo somente a fronteira IPC. O job numérico executa adicionalmente o runner Rust com o OOFEM real.

Os testes de interface cobrem desenho a partir de um projeto vazio, edição de carga, histórico, salvar/abrir, erro de solver no navegador e exportação da entrada. A CI verifica o layout mínimo de 1100 × 720 e produz uma captura em `test-results/kstruct-workspace.png`.

Na CI, Playwright usa o Chrome disponibilizado pelo runner Ubuntu e registra sua versão no log. Localmente, utiliza o Chromium instalado pelo próprio Playwright. A renderização 3D dos testes usa SwiftShader.

## Distribuição e regressão em pórtico

O pórtico XZ de dois pavimentos tem pilares com propriedades diferentes, dois carregamentos uniformes e forças e momento nodais. A [referência independente](../tests/fixtures/portal-reference.py) monta a matriz de rigidez por barras de Euler–Bernoulli com Python e NumPy. A integração compara as reações nas bases, translações e rotações de cobertura e momentos de extremidade da viga superior.

O [workflow de pacotes](https://github.com/ricardocorsini/k-struct/actions/workflows/desktop-packages.yml) repete os benchmarks com o executável produzido em cada plataforma. Ele instala o NSIS e o .deb e testa o AppImage extraído. Cada pacote é submetido ao autoteste nativo sem OOFEM no PATH e com acesso externo desabilitado para a execução de teste. O relatório registra as reações e a flecha da viga, e o workflow confere os hashes do executável e do arquivo-fonte instalado.

Os testes do runner exercitam cancelamento, tempo limite e persistência de registros. O Playwright verifica as ações de cancelar, recuperar o histórico e consultar o diagnóstico usando a fronteira IPC simulada, enquanto os testes dos pacotes executam o OOFEM real.

## Diagnóstico de duplicidades

A varredura compara a distância euclidiana em XYZ com a tolerância convertida para metros. A união só é válida quando cada par do conjunto está dentro da tolerância e todos os IDs removidos apontam diretamente ao sobrevivente. A suíte confere cotas distintas, cadeias de vizinhos, barras invertidas, barras nulas criadas pela união, sobreposições parciais e transferências por padrão e grupo.

No teste com OOFEM 3.0, o modelo de entrada contém duas barras de sentidos opostos entre os mesmos apoios e uma carga de −10 kN/m em cada barra. O diagnóstico conserva a barra invertida. Ao escolher a carga de uma origem, a reação é de 30 kN por apoio. Ao escolher a soma, passa a 60 kN. O Playwright verifica o destaque no modelo, conflitos de cargas e apoios, cancelamento, desfazer e nova varredura.

## Divisão e união de uma viga carregada

O benchmark resolve a viga biapoiada de 6 m, divide a barra a 2 m do nó inicial e volta a uni-la com a seleção invertida. Os trechos de 2 e 4 m mantêm −10 kN/m em Z, correspondentes a −20 e −40 kN. O OOFEM 3.0 é executado nas três geometrias. O teste compara as reações de 30 kN em cada apoio e, na mesma abscissa global de 3 m, o momento de 45 kN·m e a flecha de −8,4375 mm.

Um caso de edição separado usa a ponta j livre, para poder aparar até X = 4 m e prolongar até X = 6 m. O teste de interface verifica as resultantes de −40 kN e −60 kN e reabre o modelo salvo entre as operações.

## Reflexão de uma viga espacial

O teste de integração monta dois balanços independentes de 2 m no mesmo projeto. O inicial parte de (2, 1, 0) na direção +X e tem seção de 14 × 32 cm girada em 27°. A cópia é produzida pelo comando de espelho no plano YZ, incluindo engaste, carga distribuída, força e momento de ponta. O teste verifica por equilíbrio as reações na raiz do balanço inicial. No referencial global elas são (−1360, −540, 3500) N e (−150, −6170, −1250) N·m.

Se $Q$ representa a reflexão, forças, translações e cargas lineares acompanham $Q$. Momentos e rotações acompanham $-Q$. A barra conserva a ordem início–fim e a direção física do eixo local $z$ da seção. O eixo local $y$ resulta do produto $z \times x$. O teste com o OOFEM 3.0 confere os seis deslocamentos de ponta, as seis reações e os seis esforços em cada estação. Nas bases locais do original e da cópia, os fatores de sinal de $(N,V_y,V_z,M_x,M_y,M_z)$ são $(+1,-1,+1,-1,+1,-1)$.

## Pórtico espacial de dois pavimentos

O [modelo de referência](../tests/fixtures/portal-spatial.json) tem nove nós, onze barras e três bases engastadas. Os pavimentos estão a 2,8 m e 6 m. Na cobertura, uma barra oblíqua tem seção girada em 27°, com carga uniforme em X, Y e Z. O nó N5 recebe forças em Y e Z e momentos em X e Z.

A [referência independente em NumPy](../tests/fixtures/portal-spatial-reference.py) usa rigidez direta, um elemento analítico por barra e cargas nodais consistentes. A integração compara todas as translações e rotações nodais, as seis componentes das reações nas bases e os esforços locais das duas extremidades de cada barra. Na referência, UY em N5 é 6,84634 mm e o My inicial da barra oblíqua é 4,31978 kN·m. O OOFEM escreve forças com menos algarismos que deslocamentos. A tolerância de comparação dos esforços e reações é 0,01 N ou N·m mais 0,006% do valor de referência.

O teste Playwright lança o modelo do vazio, altera eixos e cotas, replica vigas, lança pilares em duas elevações, aplica apoios e cargas, salva, reabre e exporta a entrada do OOFEM. Com `OOFEM_BIN`, resolve a entrada exportada, compara os valores com a solução independente e exercita as tabelas e diagramas espaciais entregando a saída real na fronteira IPC. O job numérico executa esse fluxo com a tag exata 3.0.

Um balanço espacial com rotação de seção de 90° verifica também a extensão axial, a flexão em ambos os planos e a torção pelas expressões fechadas de Euler–Bernoulli e Saint-Venant.

## Casos de carga no pórtico espacial

O Playwright reutiliza a geometria do pórtico para cadastrar um caso vertical com carga uniforme em B5 e um caso de vento Y com força nodal em N5. O teste salva e reabre o projeto e confere as entradas do OOFEM exportadas para cada caso.

Com `OOFEM_BIN`, o caso vertical tem resultante de reação de 25,654 kN em Z. O caso de vento aplica o fator de ensaio −0,75 sobre a força de 12 kN em Y e tem resultante de reação de 9 kN em Y. O teste confere as duas resultantes, alterna entre diagramas já calculados, verifica a identificação do caso no CSV e confirma a invalidação dos resultados após uma edição.

## Combinações lineares

A viga plana e o pórtico espacial são analisados no OOFEM 3.0 com ações distribuídas `G` e nodais `W`. Em cada modelo, `1,5 (1,2 G + 0,25 W) − 0,8 (−0,5 G + 0,75 W)` é comparado a uma análise direta com `2,2 G − 0,225 W`. A comparação cobre reações nos apoios, translações e rotações nos nós e todas as componentes de deslocamentos e esforços em cada estação das barras.

As tolerâncias refletem os algarismos impressos pelo OOFEM. Para forças e momentos, o erro absoluto admitido é de 0,1 N ou N·m mais 0,01% do valor de referência. O teste de interface verifica casos pendentes, diagrama, tabela, composição no CSV, reabertura e descarte dos resultados após uma edição.

## Envelopes de esforços

O benchmark usa um pórtico espacial em L com viga de 4 m, pilar engastado de 3 m e duas combinações de forças e momentos na extremidade livre. No meio da viga, a primeira combinação governa o maior momento `My = 11,99 kN·m` com `N = −4,8 kN`. A segunda governa a maior compressão `N = −15,1 kN` com `My = −4,98 kN·m`. O teste confere as seis componentes simultâneas em cada extremo por equilíbrio do trecho e análise direta de cada combinação no OOFEM 3.0.

O teste plano verifica a conservação do sinal e o desempate pela ordem de seleção. O Playwright verifica escolha das combinações, estação selecionada no diagrama, tabela, CSV, reabertura e invalidação. Os limites são avaliados nas estações da malha e ligados por segmentos no diagrama.

## Placa retangular simplesmente apoiada

O caso usa uma placa isolada no plano XY, de 4,00 m em X por 3,00 m em Y, com 0,10 m de espessura. O material elástico isotrópico `IsoLE` tem E = 30 GPa e ν = 0,20. A seção `SimpleCS` fornece a espessura. A pressão de −5.000 N/m² em Z resulta em −60.000 N. O caso tem um passo de `StaticStructural`, com a pressão constante durante o passo. A densidade de 2.500 kg/m³ consta no material e o caso só aplica a pressão.

### Elemento, malha e apoios

O elemento `qdktplate` é o quadrilátero de quatro nós da teoria discreta de Kirchhoff (QDKT). A relação entre o vão menor e a espessura é 30, adequada ao caso de placa delgada. A formulação elimina a deformação por cisalhamento transversal, como a solução de Kirchhoff–Love usada na referência. O domínio `2dMindlinPlate` declara os três graus de liberdade por nó. A formulação de flexão vem do registro `qdktplate` e usa quatro pontos de Gauss. [Manual da tag v3.0](https://github.com/oofem/oofem/blob/v3.0/doc/elementlibmanual/elementlibmanual.tex#L842) · [Registro e implementação do QDKT](https://github.com/oofem/oofem/blob/v3.0/src/sm/Elements/Plates/qdkt.C#L56)

Cada célula retangular da grade é um elemento. O gerador numera nós e elementos em linhas, primeiro em X e depois em Y. Em cada célula, os vértices são nordeste, noroeste, sudoeste e sudeste, em sentido anti-horário visto de +Z. Suas coordenadas naturais são `(+1,+1)`, `(-1,+1)`, `(-1,-1)` e `(+1,-1)`. `ConstantSurfaceLoad` usa eixos globais (`csType 0`) e `dofs 3 3 4 5 components 3 -5000 0 0`. O conjunto `elementboundaries` contém o par `(ID do elemento, face 1)` para cada célula, de modo que a carga seja integrada sobre toda a área. [Gerador da entrada](../tests/fixtures/plate-benchmark.ts)

| Borda           | Graus de liberdade prescritos | Rotação livre |
| --------------- | ----------------------------- | ------------- |
| X = 0 e X = 4 m | Uz = 0 (GL 3), Rx = 0 (GL 4)  | Ry (GL 5)     |
| Y = 0 e Y = 3 m | Uz = 0 (GL 3), Ry = 0 (GL 5)  | Rx (GL 4)     |

Nos quatro cantos, os três graus de liberdade são prescritos. A referência impõe `w = 0` e momento normal à borda `Mnn = 0`. Na cinemática de Kirchhoff, `Rx = ∂w/∂y` e `Ry = −∂w/∂x`. A rotação prescrita em cada borda corresponde à derivada tangencial, que se anula onde `w = 0`. A rotação livre deixa a inclinação normal variar, permitindo a condição natural de momento normal nulo. Os apoios são bilaterais e as reações são somadas com sinal.

### Referência independente e recuperação

O cálculo de Navier resolve `D ∇⁴w = pz`, com `D = Eh³/[12(1 − ν²)]`. Para `a = 4 m`, `b = 3 m`, `α = mπ/a` e `β = nπ/b`, expande a pressão uniforme em senos com coeficientes `16 pz/(π²mn)` para índices ímpares. Cada coeficiente de pressão é dividido por `D(α² + β²)²` para obter a amplitude de deslocamento. As derivadas `wxx = ∂²w/∂x²` e `wyy = ∂²w/∂y²` dão `Mx = D(wxx + νwyy)` e `My = D(wyy + νwxx)`. A soma usa 256 termos ímpares em cada direção. Ao dobrar de 128 para 256, a flecha muda em menos de 4 × 10⁻¹² mm e cada momento em menos de 3,0 × 10⁻⁷ kN·m/m. [Cálculo de referência](../tests/fixtures/plate-navier.ts) · [Referência sobre a solução de Navier](https://doi.org/10.1155/2017/6516471)

O ponto de consulta é sempre o nó em (2,00 m, 1,50 m, 0), comum aos quatro elementos adjacentes. A flecha vem da linha `dof 3 d` do nó, em metros, com Z positivo para cima. O equilíbrio usa as linhas `Node … iDof 3 reaction` dos nós das bordas, em newtons.

Para a issue #10, associe cada bloco `element <rótulo> (<número interno>)` ao ID da célula usando o rótulo. Em cada linha `stresses` dos pontos `GP 1.1` a `GP 1.4`, leia as colunas 4 e 5, contando a partir do primeiro número. Elas contêm os momentos de flexão por unidade de largura, em N·m/m, nas seções de normais X e Y. Inverta os sinais de ambas as colunas para obter Mx e My positivos em flexão sagente. Os pontos naturais, na ordem da saída, são `(-g,-g)`, `(-g,+g)`, `(+g,-g)` e `(+g,+g)`, com `g = 1/√3`. Para recuperar os momentos no nó central, extrapole bilinearmente os quatro valores de cada célula até seu vértice central `(ξ, η)` e faça a média das quatro estimativas. Para cada ponto de sinais `(sx, sy)`, o peso da extrapolação é `(1 + sx ξ/g)(1 + sy η/g)/4`. [Ordem dos pontos e quadratura](https://github.com/oofem/oofem/blob/v3.0/src/core/gaussintegrationrule.C#L102)

### Resultados e reprodução

Resultados do OOFEM 3.0 no commit `214b161ed3acb471f2d0104b004c37fd73bafaa2`. Os erros são relativos absolutos à referência de Navier.

| Malha X × Y | Elementos | Σ Rz (kN) |     Uz (mm) | Mx (kN·m/m) | My (kN·m/m) | Erro Uz (%) | Erro Mx (%) | Erro My (%) |
| ----------- | --------: | --------: | ----------: | ----------: | ----------: | ----------: | ----------: | ----------: |
| 8 × 6       |        48 |  60,00020 | −1,02668720 |    1,997732 |    3,127024 |      0,4106 |      0,5840 |      1,7010 |
| 16 × 12     |       192 |  60,00000 | −1,02991662 |    1,989041 |    3,087367 |      0,0974 |      0,1464 |      0,4112 |
| 32 × 24     |       768 |  60,00014 | −1,03067275 |    1,986897 |    3,077772 |      0,0240 |      0,0385 |      0,0991 |
| Navier      |         — |         — | −1,03092043 |    1,986133 |    3,074724 |           — |           — |           — |

A regressão admite um resíduo de equilíbrio menor que 3 N (0,005% da carga total). A soma de meia unidade na última casa de cada reação impressa chega a 2,44 N entre as três malhas. Para as grandezas centrais, o erro deve cair pelo menos pela metade a cada refinamento. Os erros medidos caem por fatores próximos a quatro. Na malha final, os limites são 0,05% para Uz, 0,10% para Mx e 0,20% para My. Esses limites têm margem sobre o erro de discretização medido e são superiores aos erros de truncamento da série e de arredondamento da saída. [Teste de regressão](../tests/plate.integration.test.ts)

Use o executável fixado pelo KStruct. No Linux, depois de `npm ci` e `npm run oofem:stage`, o teste focado resolve as três malhas e imprime os resultados e os erros. [Configuração do OOFEM](OOFEM.md)

```sh
OOFEM_BIN="$PWD/.oofem-dist/build/bin/oofem" npm test -- tests/plate.integration.test.ts
```

No Windows, use o caminho absoluto do `oofem.exe` em `OOFEM_BIN`. A regressão integra `npm run check` e é explicitamente ignorada se `OOFEM_BIN` estiver ausente.

A regressão também lança o painel QDKT pelo modelo do editor, em posição deslocada da origem, e compara a entrada e o parser de produção com os resultados do gerador independente nas três malhas. A comparação cobre a soma de reações e os valores centrais de UZ, Mx e My.

## Laje retangular isolada

Selecione **Triangular DKT** para repetir os resultados desta seção. **Quadrilateral QDKT** é a formulação inicial do editor e reproduz a tabela da seção anterior.

O caso da [issue #9](https://github.com/ricardocorsini/k-struct/issues/9) usa uma placa de 4 × 3 m, espessura de 0,10 m, E = 30 GPa, ν = 0,20 e pZ = −5 kN/m². A resultante aplicada é −60 kN. A malha DKT usa dois triângulos de Kirchhoff (DKT) por célula retangular. O apoio simples impõe UZ e a rotação correspondente à inclinação tangencial de cada borda. No interior das bordas, a rotação em torno da própria borda fica livre. Essa condição aproxima as bordas com flecha nula e momento normal nulo da referência. As propriedades do elemento e as cargas nodais equivalentes estão no [contrato do motor](OOFEM.md#laje-retangular-isolada).

A referência independente é a série de Navier para uma placa elástica isotrópica delgada. Com a e b como lados, usa-se D = Eh³/[12(1−ν²)], α = mπ/a e β = nπ/b. Para m e n ímpares, a amplitude de UZ é 16 pZ/[π²mn D(α² + β²)²]. As amplitudes de Mx e My na convenção sagente positiva são obtidas multiplicando a de UZ por −D(α² + νβ²) e −D(β² + να²), respectivamente. No centro, os senos alternam entre +1 e −1. A [implementação da série](../tests/fixtures/slab-benchmark.ts) soma os índices ímpares até 201. A referência e o DKT desprezam o cisalhamento transversal.

O parser lê UZ diretamente no nó central nas três malhas de referência. Nos mapas, Mx e My são a média dos três pontos de Gauss de cada triângulo. Para a consulta central, os momentos são extrapolados linearmente para os vértices e promediados entre os triângulos adjacentes. No ponto de Gauss mais próximo de um vértice, os pesos baricêntricos são 2/3, 1/6 e 1/6. A inversão é `M_vértice = 2 M_GP − M_médio`. Um teste com campos afins de Mx e My confere cada vértice, inclusive os de borda. Com subdivisões ímpares, a consulta interpola no segmento que passa pelo centro.

Valores medidos com OOFEM 3.0 no commit `214b161ed3acb471f2d0104b004c37fd73bafaa2`. UZ é negativo para baixo. Momentos positivos tracionam a face inferior na direção indicada pelos eixos X e Y do painel.

| Subdivisões X × Y | Triângulos | ΣRZ (kN) | UZ (mm)   | Mx (kN·m/m) | My (kN·m/m) | Erro UZ / Mx / My     |
| ----------------- | ---------- | -------- | --------- | ----------- | ----------- | --------------------- |
| 8 × 6             | 96         | 59,99980 | −1,013955 | 2,02504     | 3,10462     | 1,65% / 1,96% / 0,97% |
| 16 × 12           | 384        | 60,00012 | −1,026874 | 1,99603     | 3,08276     | 0,39% / 0,50% / 0,26% |
| 32 × 24           | 1.536      | 59,99996 | −1,029932 | 1,98866     | 3,07682     | 0,10% / 0,13% / 0,07% |
| Navier            | —          | 60,00000 | −1,030920 | 1,98613     | 3,07472     | —                     |

O teste exige erro decrescente em todas as grandezas centrais, erro relativo inferior a 0,5% na malha final e diferença inferior a 1 N na soma das reações verticais em cada malha. A tolerância de 0,5% cobre o erro de discretização e recuperação de momentos na malha fina. A de 1 N acomoda a precisão textual do OOFEM para as reações. Uma segunda regressão verifica apoios opostos, pressão ascendente obtida por fatores de carga e a solução de faixa para ν = 0. Uma análise incompleta ou em desequilíbrio é rejeitada.

O Playwright lança a laje na cota do pavimento, edita as bordas e a pressão, salva, reabre e compara a entrada exportada com a do modelo persistido. Com o motor disponível, substitui apenas a fronteira IPC e resolve a entrada que a própria interface envia ao OOFEM. Confere os três mapas, a tabela central, o refinamento e a invalidação por edição, desfazer, refazer e conclusão de uma análise iniciada em revisão anterior.

```sh
OOFEM_BIN=/caminho/absoluto/oofem npm run check
OOFEM_BIN=/caminho/absoluto/oofem npm run test:e2e -- slab.spec.ts
```

## Conexões internas em barras físicas (KS-15)

Execute `OOFEM_BIN=/caminho/para/oofem npm run check` com o OOFEM 3.0 fixado no projeto. Os ensaios estão em `tests/oofem.integration.test.ts`. O arquivo `tests/fixtures/internal-joint-oofem.txt` contém a saída do solver distribuído para a viga com oito subdivisões regulares. O teste do parser usa essa saída também nos ambientes sem binário.

| Modelo                                                                                            | Referência independente                                                                                                                                                                                                   | Comparação                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uma barra XZ de 6 m, nós A e B nas extremidades, C a 2 m de A, carga de −9 kN em C                | Equilíbrio fornece RAz = 6 kN e RBz = 3 kN. O momento sagente em C vale 12 kN·m. Para a dimensão a = 2 m, b = 4 m, a flecha em C vale −P a² b²/(3 EI L).                                                                  | Refinamentos 8, 6 e 13. No padrão, a conexão acrescenta a nona célula. Cortante de +6 kN no lado i e −3 kN no lado j. Tolerâncias absolutas de 0,05 N, 0,05 N·m e 5 × 10⁻¹⁰ m.                                                                     |
| Mesma barra com ambas as pontas livres, engaste em C e qZ = −1 kN/m nos 6 m                       | Os balanços medem 2 e 4 m. RZ = 6 kN, MY = −6 kN·m, momentos na barra de −2 e −8 kN·m nos lados i e j.                                                                                                                    | O engaste interno estabiliza o componente. Os esforços preservam o salto devido à reação concentrada.                                                                                                                                              |
| Banzo espacial de 6 m, engastado na origem, seção girada 23°, montante vertical de 2 m em x = 2 m | Referência construída com duas barras físicas de 2 e 4 m e o mesmo montante. A carga de ponta (1,1; 1,7; −9) kN e qZ = −0,65 kN/m no banzo exigem reação global (−1,1; −1,7; 12,9) kN e momentos (3,4; −31,9; −3,4) kN·m. | Refinamentos 5, 8 e 12 contra a referência com 8 por peça. Conferem-se os seis deslocamentos generalizados dos nós, as seis reações e os seis esforços nas extremidades e em cada lado do encontro. Tolerâncias de 5 × 10⁻⁹ m ou rad e 1 N ou N·m. |

O teste de interface `tests/e2e/mesh-connections.spec.ts` conecta C, inspeciona a camada de malha, desfaz e refaz, refina, salva e reabre o projeto. Na envoltória dos fatores +1 e −1, o máximo de V em x/L = 1/3 é governado pela combinação direta do lado i e pela invertida do lado j. O teste confere a tabela e o CSV pelo ID do membro, pela posição, pelo lado e pela combinação.

## Materiais compartilhados e independentes (KS-17)

Dois balanços XZ independentes de 3 m têm seções de 20 × 30 cm e carga de ponta de −10,5 kN. As duas seções começam vinculadas ao mesmo aço, com E = 210 GPa, ν = 0,30, ρ = 7.850 kg/m³ e α = 0,000012/K. A referência de Euler–Bernoulli fornece $I_y=bh^3/12=0{,}00045\,\mathrm{m}^4$ e $u_z=-PL^3/(3EI_y)$, com $P$ em módulo.

| Configuração                                     | Flecha na ponta A | Flecha na ponta B |
| ------------------------------------------------ | ----------------: | ----------------: |
| Duas seções com E = 210 GPa                      |         −1,000 mm |         −1,000 mm |
| Cópia com E = 420 GPa atribuída apenas à seção B |         −1,000 mm |         −0,500 mm |

Em ambas as configurações cada engaste deve fornecer +10,5 kN em Z e −31,5 kN·m em Y. O teste verifica os IDs de material nos registros `SimpleCS`, as propriedades em `IsoLE`, as flechas com tolerância absoluta de 5 × 10⁻¹¹ m e as reações com 0,05 N ou N·m. Outro ensaio abre a viga biapoiada no formato v8 e confere α = 0, a flecha de −8,4375 mm e o momento de +45 kN·m no meio do vão.

Execute `OOFEM_BIN=/caminho/absoluto/oofem npm run check`. O fluxo de interface em `tests/e2e/materials.spec.ts` verifica edição compartilhada, cópia, reatribuição, desfazer/refazer e reabertura do arquivo. Com `OOFEM_BIN` configurado, resolve também a entrada exportada pela interface.

## Ainda não validado nesta etapa

Flambagem/P–Δ, massas/modal, cascas, ligação entre lajes e barras, offsets, molas acopladas, dimensionamento e desempenho em grandes modelos.

## KS-21 · liberações e ligações semirrígidas

O formato v25 registra a ligação por componente nos eixos locais de cada extremidade. Uma barra de arquivos anteriores mantém todas as direções rígidas, salvo se o arquivo experimental já informar a ligação. O adaptador usa um `RigidArmNode` coincidente com a face e uma `Spring` por direção elástica. A saída da face é transformada para eixos globais. Os deslocamentos do nó de lançamento e da face da barra podem ser consultados separadamente. [Transformação do nó na versão fixada](https://github.com/oofem/oofem/blob/v3.0/src/core/rigidarmnode.C)

Na viga de 6 m com −10 kN/m, a ligação articulada dá 30/30 kN e momento de ponta nulo. A ligação rígida em A dá 37,5/22,5 kN e |M_A| = 45 kN·m. Com kθ = 3EI/L, |M_A| = 22,5 kN·m e M/Δθ reproduz a rigidez com erro inferior a 1%, inclusive invertendo a barra e alterando as subdivisões.

Ao liberar RY em ambas as extremidades, verifique 30 kN em cada apoio e |M| = 45 kN·m no meio do vão, em XZ e XYZ. Os ensaios admitem 1 N·m nas pontas e 0,5 N·m no meio do vão. Uma rotação desconectada e descarregada recebe um valor de referência nulo. Um momento efetivo nessa direção identifica o mecanismo antes de executar o solver. Um padrão fora do caso, um fator zero e momentos de padrões distintos que se anulam preservam o resultado. Uma mola nodal de 20.000 N·m/rad submetida a 100 N·m gira 0,005 rad e preserva o momento nulo na ponta articulada. As regressões incluem a rotação do sistema espacial e a leitura independente da rotação da face.

```sh
OOFEM_BIN=/caminho/absoluto/oofem npm test -- tests/oofem.integration.test.ts -t KS-21
npm run test:e2e -- member-connections.spec.ts
```

## KS-18 · seções de barras e balanço espacial

O catálogo recebe dimensões em cm e o domínio trabalha em metros. A largura acompanha y local, a altura acompanha z local e x vai de i para j. A rotação positiva segue a regra da mão direita em torno de x. A tabela usa mm para permitir a conferência direta com as dimensões de referência.

| Forma e dimensões (mm)               |   A (mm²) |       Iy (mm⁴) |      Iz (mm⁴) |       J (mm⁴) |
| ------------------------------------ | --------: | -------------: | ------------: | ------------: |
| Círculo, d = 100                     | 7 853,982 |  4 908 738,521 | 4 908 738,521 | 9 817 477,042 |
| Tubo, D = 100, t = 10, di = 80       | 2 827,433 |  2 898 119,223 | 2 898 119,223 | 5 796 238,446 |
| I, h = 200, b = 100, tf = 10, tw = 6 | 3 080,000 | 20 982 666,667 | 1 669 906,667 |    80 346,667 |

No círculo maciço, A = πd²/4, Iy = Iz = πd⁴/64 e J = πd⁴/32. No anel, a referência subtrai o círculo interno do externo. A parede deve satisfazer 0 < t < D/2. O retângulo conserva os 60 termos ímpares da série de Saint-Venant usada nas versões anteriores.

O I tem duas mesas iguais, alma centrada e cantos vivos. Com a altura livre hw = h − 2tf, a conferência independente usa o retângulo externo e os dois vazios para Iy, e três retângulos para Iz.

- A = 2b·tf + hw·tw.
- Iy = [b·h³ − (b − tw)·hw³]/12.
- Iz = [2tf·b³ + hw·tw³]/12.
- Para torção uniforme de Saint-Venant em chapas finas, J ≈ [2b·tf³ + (h − tf)·tw³]/3. A altura h − tf vai do centro de uma mesa ao centro da outra. Raios de concordância, cordões de solda e rigidez de empenamento restringido ficam fora do modelo. Iy + Iz é o momento polar geométrico. O exemplo publicado W610×125 (612 × 229 × 19,6 × 11,9 mm) resulta em 1,4823 × 10⁶ mm⁴, compatível com os 1,48 × 10⁶ mm⁴ da fonte. [CISC, _Torsional Section Properties of Steel Shapes_, p. 6, equações 6 e 8](https://www.labciv.eng.uerj.br/pgeciv/files/Torsion%20Properties.pdf)

O KStruct limita a aproximação de J a b/tf ≥ 10 e hw/tw ≥ 10 e exige tw < b. Esses limites são um critério de aplicação adotado pelo projeto. O formulário identifica a dimensão a corrigir e impede salvar. O esquema do arquivo também verifica esses limites.

**Balanço espacial.** Uma barra de 2 m em +X tem os seis graus de liberdade impedidos em i. Em j atuam Fy = +300 N, Fz = −900 N e Mx = +15 N·m. O material tem E = 210 GPa, ν = 0,30 e G = E/[2(1 + ν)]. Com rotação da seção igual a zero, a referência de Euler–Bernoulli fornece uy = Fy·L³/(3E·Iz), uz = Fz·L³/(3E·Iy) e rx = Mx·L/(GJ).

| Seção    |   uy (mm) |   uz (mm) |  rx (mrad) |
| -------- | --------: | --------: | ---------: |
| Circular | +0,776070 | −2,328209 | +0,0378334 |
| Tubular  | +1,314481 | −3,943444 | +0,0640810 |
| I        | +2,281279 | −0,544667 |  +4,622825 |

O teste roda o OOFEM 3.0 com oito elementos Beam3d para cada seção, primeiro a 0° e depois a 90°. Um quarto de volta troca Iy e Iz nas duas referências de flexão. A tolerância relativa para cada deslocamento e rotação é 2 × 10⁻⁶. O balanço retangular da v9 passa pela migração antes de verificar a flexão biaxial, a força normal, a torção e as reações. Os testes estão em `tests/sections.test.ts` e `tests/oofem.integration.test.ts`.

## KS-19 · inversão de i/j e rotação da seção

No pórtico espacial de referência, a diagonal B5 tem seção de 15 × 20 cm, ângulo de 27° e carga uniforme nas três direções globais. Resolva o mesmo caso antes e depois de inverter i/j. As seis reações e os seis deslocamentos generalizados globais devem coincidir. Para cada estação original, use `1 − x/L` e transforme a base e a face conforme a [convenção de sinais](ARCHITECTURE.md#unidades-e-sinais). A comparação usa 5 × 10⁻¹⁰ m ou rad para deslocamentos e 0,01 N ou N·m mais 6 × 10⁻⁵ do valor de referência para forças e momentos impressos.

Um balanço espacial horizontal de 6 m, com E = 200 GPa e a mesma seção, recebe Fy = +1,2 kN e Fz = −2,4 kN na ponta. Use $I_y = bh^3/12$, $I_z = hb^3/12$ e a referência de Euler–Bernoulli $u = P L^3/(3 E I)$. A rotação a 90° troca as inércias usadas em cada direção. Os deslocamentos conferem com tolerância de 5 × 10⁻⁹ m.

| Orientação da seção | UY na ponta | UZ na ponta |
| ------------------- | ----------: | ----------: |
| 0°                  |    +7,68 mm |    −8,64 mm |
| 90°                 |    +4,32 mm |   −15,36 mm |

Depois de inverter i/j com a seção já a 90°, os deslocamentos continuam iguais aos da última linha. Ensaios adicionais conferem N = +1,8 kN nas duas orientações em XZ e XYZ e a troca dos lados de uma seção interna carregada.

Execute `OOFEM_BIN=/caminho/absoluto/oofem npm run check` para repetir os ensaios e `OOFEM_BIN=/caminho/absoluto/oofem npm run test:e2e -- member-axes.spec.ts` para conferir a exibição, a revisão dos resultados, o histórico e a reabertura.

## KS-20 · apoios inclinados

Na viga de 6 m em XZ, A restringe UX e UZ, B restringe apenas a translação ao longo de n = (0,6, 0, 0,8) e qZ = −10 kN/m. Use a tangente t = (0,8, 0, −0,6), com ângulo de −36,86989765° em relação a +X. Os momentos em A e as forças em Z dão RBz = RAz = 30 kN. Como RB = RN·n, resulta RN = 37,5 kN e RBx = +22,5 kN. Pelo equilíbrio em X, RAx = −22,5 kN. O rolete ideal tem RT = 0. A força axial de tração fornece UX em B de RBx·L/(EA) = +0,0225 mm e a compatibilidade n·uB = 0 fornece UZ = −0,016875 mm.

O ensaio com o OOFEM 3.0 aceita 0,005 N ou N·m nos valores da viga e 5 × 10⁻¹³ m na compatibilidade e nos deslocamentos da ponta. Confere o registro local de reação normal do solver e a transformação para a estação final da deformada. Com Fx = +3 kN, Fz = −4 kN e My = +1,2 kN·m adicionais em B, o equilíbrio fornece RAx = −28,65 kN, RAz = +29,8 kN, RBx = +25,65 kN e RBz = +34,2 kN. Esse ensaio confirma que a carga nodal permanece global.

Em XYZ, um balanço com UZ e RX restritos na ponta é resolvido antes e depois de girar a geometria, a seção, os apoios e as cargas. A rotação independente tem colunas (1,2,2)/3, (2,1,−2)/3 e (−2,2,−1)/3. O ensaio compara cada reação, cada estação de deslocamento e os esforços no referencial da barra. A tolerância é de 2 N ou N·m, compatível com a saída impressa, e 5 × 10⁻¹⁰ m ou rad nas translações e rotações. O ângulo zero no plano reproduz o caso legado. Direções paralelas insuficientes são rejeitadas antes de executar o solver.

A inversão i/j da barra também preserva as reações e o deslocamento global do rolete. Em dois balanços de 6 m (um horizontal e um vertical), a carga de −12.345 N em Z exige reação vertical de +12.345 N num engaste orientado a 31°. O OOFEM imprime cinco algarismos significativos por componente local. A verificação de equilíbrio propaga metade da última casa impressa de cada componente pelos eixos do apoio e pelo braço da força. Os ensaios verificam o equilíbrio em relação à ponta livre e a rejeição da saída quando uma reação local é alterada em 10 N.

Execute `OOFEM_BIN=/caminho/absoluto/oofem npm run check` para repetir os ensaios e `OOFEM_BIN=/caminho/absoluto/oofem npm run test:e2e -- inclined-supports.spec.ts` para verificar edição, desfazer/refazer, persistência, reanálise, tabela e CSV.

## KS-22 · treliça articulada e flexão local do banzo

As entradas abaixo são referências independentes do exportador do KStruct. Usam barras de pórtico do OOFEM 3.0. Em cada articulação, nós coincidentes compartilham as translações e permitem que cada barra gire independentemente. As cargas permanecem nos pontos ou trechos em que foram aplicadas. O módulo `errorcheck` compara as grandezas calculadas com os valores analíticos a cada passo.

### Dois carregamentos na mesma treliça plana

Em [pinned-truss.in](../tests/fixtures/pinned-truss.in), os nós A=(0, 0), B=(6, 0) e C=(3, 4) estão no plano XZ. A restringe UX e UZ, e B restringe UZ. Os três membros têm E = 200 GPa, A = 1.000 mm² e Iy = 2,5 × 10⁻⁵ m⁴. O banzo AB tem dois elementos contínuos no meio do vão. A articulação fica nas pontas físicas.

| Carregamento                                        | Reações verticais em A e B | Esforços e deslocamentos de referência                                                                                                                                      |
| --------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Força de 10 kN para baixo em C                      | 5 kN em cada apoio         | Tração de 3,75 kN em AB e compressão de 6,25 kN em AC e BC. Cortantes e momentos nulos. UZ de C = −0,2375 mm.                                                               |
| Carga uniforme de 10 kN/m para baixo ao longo de AB | 30 kN em cada apoio        | Momento nulo nas pontas e sagente de 45 kN·m no meio do vão. Cortante de +30 kN junto a A e −30 kN junto a B na convenção de seção do KStruct. Flecha central de −33,75 mm. |

No primeiro caso, as diagonais medem 5 m e a componente vertical da força em cada uma vale 4/5 do seu módulo. O deslocamento segue do trabalho virtual, somando as contribuições axiais das três barras. No segundo, para o módulo da carga uniforme q, o momento central vale qL²/8 e a flecha central em módulo vale 5qL⁴/(384EIy). As tolerâncias absolutas são 10⁻⁷ N ou N·m nos esforços, 10⁻¹⁰ m no deslocamento de C e 10⁻⁹ m na flecha de AB.

### Barra articulada ligada a um pórtico espacial

Em [pinned-brace-3d.in](../tests/fixtures/pinned-brace-3d.in), AB é um balanço de 3 m na direção X. BC mede 2 m na direção Y, tem extremidades articuladas à flexão e sua torção é liberada em B. O nó B recebe Fy = 10 kN, Fz = −6 kN, Mx = 0,9 kN·m e Mz = 6 kN·m. A rotação de B pertence ao balanço e a barra BC acompanha a translação desse nó.

Para obter UY de B, use k = EA/L de BC, f = L³/(3EIz) e g = L²/(2EIz) de AB. A compatibilidade dá UY = (f·Fy + g·Mz)/(1 + k·f) = 0,1277293 mm. BC recebe 12,772926 kN de compressão e seus momentos de extremidade são nulos. Em B, o balanço apresenta UZ = −2,7 mm, RX = 0,351 mrad, RY = 1,35 mrad e RZ = 0,3451146 mrad. As tolerâncias são 10⁻⁵ N ou N·m e 10⁻¹⁰ m ou rad.

Execute o teste abaixo com o solver fixado pelo projeto para repetir os três casos.

```sh
OOFEM_BIN=/caminho/absoluto/oofem npm test -- tests/pinned-truss.integration.test.ts
```

### Articulação em lote no KStruct

Selecione uma ou mais barras e, em **Propriedades**, clique em **Articular as duas extremidades**. Em XZ, o comando libera Ry em i e j. Em XYZ, libera Ry e Rz nas duas pontas, libera Rx em i e fixa Rx em j. Os graus de translação conservam as ligações existentes. Aplicar o comando a uma seleção conta como uma edição no histórico.

O teste `tests/member-hinges.integration.test.ts` aplica o mesmo comando às barras dos modelos de referência e executa o arquivo exportado pelo KStruct. Na treliça plana, confira 5 kN em cada apoio, 3,75 kN de tração no banzo, 6,25 kN de compressão nas diagonais e UZ de C de −0,2375 mm. Sob carga transversal do banzo, confira 30 kN em cada apoio, cortantes de +30 e −30 kN nas pontas, momento de 45 kN·m e flecha de −33,75 mm no centro para malhas de 2 e 8 segmentos. Na ligação espacial, articule apenas BC. Confira 12,772926 kN de compressão em BC, momentos nulos e as rotações de B da referência independente.

A comparação com a saída impressa do OOFEM admite 0,5 N ou 0,5 N·m para forças e momentos, 5 × 10⁻¹¹ m para UZ de C, 5 × 10⁻⁹ m para a flecha do banzo e 5 × 10⁻¹⁰ m ou rad para os deslocamentos de B no pórtico espacial. Execute `npm test -- tests/member-hinges.integration.test.ts` e `npm run test:e2e -- member-connections.spec.ts` com `OOFEM_BIN` configurado. O teste de interface cobre seleção múltipla, um passo de desfazer/refazer, reabertura e as reações verticais da treliça.

## KS-23 · excentricidades de inserção e trechos rígidos

Os ensaios usam o OOFEM 3.0 fixado pelo projeto. As coordenadas dos nós e as excentricidades estão em metros. Nos ensaios axiais, o balanço tem 6 m, E = 200 GPa e A = 0,03 m².

| Ensaio                                                                                                      | Valor de referência                                                                                                          |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Balanço XYZ ao longo de X, nó de aplicação 0,20 m em +Y em relação à seção da ponta, Fz = −10 kN            | Mx da seção = −2 kN·m. No engaste, Rz = +10 kN, Mx = +2 kN·m e My = −60 kN·m. Trocar o lado do braço inverte Mx.             |
| Barra XZ e XYZ com P = 60 kN                                                                                | Alongamento de 0,060 mm na barra centrada e 0,050 mm com 0,50 m rígido em cada ponta. Neste último caso, PL/(EA) usa 5 m.    |
| Carga qz = −10 kN/m com eixo 0,20 m em +Y e trechos rígidos de 0,50 e 1,00 m                                | No engaste, Rz = +60 kN, Mx = +12 kN·m e My = −180 kN·m. Os momentos fletores em módulo nas faces i e j são 151,25 e 5 kN·m. |
| Dois apoios verticais a 0,50 m um do outro, na mesma zona rígida inicial de 1 m, com Fz = −1 kN no nó a 6 m | Reações verticais de −11 e +12 kN. A flecha na ponta é −2,083333 mm para Iy = 0,0001 m⁴.                                     |

O ensaio de torção compara o nó excêntrico com uma força e um binário aplicados diretamente no eixo. A excentricidade de inserção no nó da ponta vale −0,20 m em Y quando o braço da seção até a carga vale +0,20 m. A comparação é repetida com i/j invertidos e com 2 e 9 elementos. A verificação axial compara 2 e 11 elementos. Os limites absolutos são 0,01 N·m na torção e 10⁻¹² m no alongamento. Os testes adicionais cobrem apoio inclinado, equilíbrio das cargas distribuídas, divisão da barra, conexões dentro do trecho rígido, na face e no trecho deformável.

```sh
OOFEM_BIN=/caminho/absoluto/oofem npm test -- tests/member-offsets.test.ts tests/member-offsets.integration.test.ts
OOFEM_BIN=/caminho/absoluto/oofem npm run test:e2e -- member-offsets.spec.ts
```

## KS-24 · modificadores de rigidez

O modelo espacial tem dois balanços de 3 m ao longo de X, cada um com a mesma seção retangular de 0,15 × 0,20 m. O aço tem E = 200 GPa, ν = 0,30 e massa específica de 7.850 kg/m³. Em cada ponta livre atuam Fx = 1.200 N, Fy = 300 N, Fz = −900 N e Mx = 15 N·m. Os valores abaixo usam A = 0,03 m², Iy = 0,0001 m⁴, Iz = 0,00005625 m⁴ e J = 0,000121808661794 m⁴.

| Fator aplicado ao primeiro balanço | Referência        | Fator 1             | Fator 0,5           |
| ---------------------------------- | ----------------- | ------------------- | ------------------- |
| EA                                 | UX = Fx·L/(EA)    | +0,0006 mm          | +0,0012 mm          |
| EIy                                | UZ = Fz·L³/(3EIy) | −0,405 mm           | −0,810 mm           |
| EIz                                | UY = Fy·L³/(3EIz) | +0,240 mm           | +0,480 mm           |
| GJ                                 | RX = Mx·L/(GJ)    | +0,00480261413 mrad | +0,00960522826 mrad |

Aplique um fator por vez. A tolerância absoluta é de 5 × 10⁻¹² m ou rad para as quatro respostas. As três outras componentes do primeiro balanço, as respostas do segundo e as reações dos engastes conservam os valores de referência. Cada barra tem massa geométrica de 706,5 kg, calculada por ρAL com a área e a massa específica exportadas. Um ensaio XZ com balanço de 6 m e Fz = −600 N compara −2,16 mm para EIy bruto e −4,32 mm para fator 0,5, com tolerância de 5 × 10⁻¹¹ m. A exportação com todos os fatores iguais a 1 coincide com a de um projeto migrado da versão 12.

Um ensaio adicional gira as duas seções em 90° e aplica à primeira barra os fatores 2 em EA, 0,5 em EIy, 1,5 em EIz e 0,25 em GJ. Uma execução usa a carga distribuída de peso próprio de −2.310,255 N/m. A outra mantém as cargas nodais e substitui a carga distribuída por gravidade nativa do OOFEM (`DeadWeight`, −9,81 m/s²), que usa a área e a densidade exportadas. O peso próprio de cada barra é 6.930,765 N. Com a força de ponta, cada engaste recebe Rz = +7.830,765 N e My = −13.096,1475 N·m. As tolerâncias de leitura são 0,05 N e 0,5 N·m. No balanço modificado, UY = +0,270 mm e UZ = −1,866153 mm. Na barra de controle, UY = +0,135 mm e UZ = −2,7992295 mm. As translações e a torção são conferidas com as expressões analíticas nas duas execuções.

Na viga contínua A–B–C, ambos os vãos medem 4 m e apenas AB recebe 12 kN/m para baixo. Pela equação dos três momentos, para `f = EI_AB / EI_BC`, o momento em B é −qL²/[8(1 + f)]. Reduzir EIy de AB de 1 para 0,5 muda o momento em B de −12 para −16 kN·m. As reações verticais em A/B/C passam de +21/+30/−3 kN para +20/+32/−4 kN. Os dois lados do apoio e as três reações são conferidos com tolerância de 0,001 N·m ou N.

Os ensaios usam o OOFEM 3.0 fixado pelo KStruct. A entrada espacial usa elementos `Beam3d` com registros `SimpleCS` e `IsoLE`. Os testes de interface verificam os controles ativos em XZ e XYZ, a rejeição do zero, a invalidação dos resultados, o histórico e o salvamento e reabertura do projeto.

```sh
OOFEM_BIN=/caminho/absoluto/oofem npm test -- tests/member-stiffness.test.ts tests/member-stiffness.integration.test.ts
OOFEM_BIN=/caminho/absoluto/oofem npm run test:e2e -- member-stiffness.spec.ts
```

## KS-25 · molas nodais

Os ensaios usam a distribuição fixada do OOFEM 3.0. A viga de referência mede 6 m e tem seção retangular de 15 × 20 cm e E = 200 GPa. A ligação A restringe UX e UZ. O nó no meio se conecta à mesma barra física para receber uma força de 20 kN para baixo. B tem rotação livre e uma mola vertical. Pelo equilíbrio, cada apoio recebe +10 kN. A reação da mola na estrutura é R = −k·u. A variação na flecha do meio devido ao recalque de B é metade do deslocamento do apoio.

| Rigidez de B   | UZ de B  | Flecha adicional no meio em relação à viga com B rígido |
| -------------- | -------- | ------------------------------------------------------- |
| 10.000 kN/m    | −1 mm    | −0,5 mm                                                 |
| 100.000 kN/m   | −0,1 mm  | −0,05 mm                                                |
| 1.000.000 kN/m | −0,01 mm | −0,005 mm                                               |

As tolerâncias absolutas no ensaio plano são 5 × 10⁻⁵ N nas reações, 5 × 10⁻¹² m em B e 5 × 10⁻¹¹ m para a flecha adicional. Zerar a única mola vertical de B produz o diagnóstico de apoio insuficiente para impedir movimento de corpo rígido.

| Ensaio adicional                                                                                   | Valores de referência                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Momento de −15 kN·m na ponta B, com A fixo em UX e UZ e mola de 5.000 kN·m/rad em RY               | RY de A = −3 mrad e momento de reação +15 kN·m.                                                                                        |
| Viga espacial com a base dos apoios inclinada em 30° em torno de X e carga girada com a normal     | B conserva UZ local = −1 mm e energia elástica de 5 J. Reação local de +10 kN, com componentes globais Ry = −5 kN e Rz = +8,660254 kN. |
| Momento de +15 kN·m em torno de um eixo local x a 30° de X no plano XY, com mola de 5.000 kN·m/rad | Rotação local de +3 mrad e momento de reação local de −15 kN·m.                                                                        |
| Mola vertical de 10.000 kN/m a 0,5 m de A, dentro do primeiro metro rígido, com −1 kN em B         | Reações verticais de −11 kN em A e +12 kN na mola, com deslocamento de −1,2 mm no nó elástico.                                         |

Nos casos acima, a tolerância é 5 × 10⁻¹² m ou rad nos deslocamentos e rotações, 5 × 10⁻⁴ N ou N·m nas reações e 5 × 10⁻⁷ J na energia. Para reproduzir a conferência mínima da sintaxe `Spring`, use um nó de solo fixo e um segundo nó com referencial a 30° em XZ, UX local e RY restringidos, mola de 1.000 kN/m em z local e força de −1 kN nessa direção. O GL 3 do segundo nó vale −0,001 m.

O cenário de interface edita a mola em kN/cm, consulta os resultados globais e locais, zera a rigidez, desfaz e refaz e confere o salvamento e a reabertura. O teste de combinação confirma que a reação da mola é multiplicada com a mesma parcela do caso.

```sh
OOFEM_BIN=/caminho/absoluto/oofem npm test -- tests/nodal-springs.test.ts tests/nodal-springs.integration.test.ts
OOFEM_BIN=/caminho/absoluto/oofem npm run test:e2e -- nodal-springs.spec.ts
```

## KS-27 — Diafragmas de pavimento

O ensaio `diaphragmBenchmark` usa um piso na cota 3 m, com nós S, C, E e N sobre X = 0 e coordenadas Y de −2, 0, +1 e +2 m. As molas em X nos nós S e N têm 6.000 kN/m cada. A translação Y é restringida no centro. A distância entre os apoios é 4 m. O movimento comum no plano não deforma as barras entre os participantes.

| Força aplicada         | Reação X em N | Reação X em S | UX no centro | Rotação θz |    UX em N / S |
| ---------------------- | ------------: | ------------: | -----------: | ---------: | -------------: |
| +12 kN em X no centro  |         −6 kN |         −6 kN |        +1 mm |          0 |     +1 / +1 mm |
| +12 kN em X a Y = +1 m |         −9 kN |         −3 kN |        +1 mm | −0,25 mrad | +1,5 / +0,5 mm |

Os valores seguem de `ΣFx = 0`, `ΣMz = 0` e da relação força–deslocamento das duas molas. Com a origem no centro, a carga excêntrica produz −12 kN·m e a rigidez à torção do piso sobre as molas vale 48.000 kN·m/rad. O teste compara as reações com tolerância absoluta de 0,001 N e os deslocamentos e rotações com 10⁻¹⁰ m ou rad. A rotação do modelo em 90° verifica a mesma resposta em Y. A troca da referência para (+0,75 m, −0,375 m), inclusive sob força e binário simultâneos, conserva os resultados físicos.

No ensaio fora do plano, a linha S–N trabalha como viga biapoiada com vão de 4 m, E = 200 GPa, seção de 0,15 × 0,20 m e uma força de −1 kN no centro. A flecha é −0,066667 mm. Um momento em torno de Y testa também a torção da barra. UZ, RX e RY dos quatro nós são comparados com a mesma viga resolvida com o diafragma removido. Outros ensaios usam apoios inclinados, componentes ligados só pelo piso, dois pavimentos independentes e uma ligação com trecho rígido. O caso mínimo usa diretamente as duas molas e estabiliza os graus fora do plano de cada nó.

A suíte de interface abre o projeto espacial, cria e edita o vínculo em centímetros, resolve o caso excêntrico, lê a reação de −9 kN, desfaz e refaz a edição e reabre o arquivo salvo. Para reproduzir com o executável fixado, execute os comandos na raiz do repositório.

```sh
OOFEM_BIN=/caminho/absoluto/oofem npm test -- tests/diaphragm.test.ts tests/diaphragm.integration.test.ts
OOFEM_BIN=/caminho/absoluto/oofem npm run test:e2e -- diaphragm.spec.ts
```

## KS-26 · Fundação acoplada de seis graus de liberdade

Selecione um nó espacial e abra **Propriedades → Apoios e restrições → Importar fundação do MolaStruct**. A prévia mostra a matriz na origem do CSV em kN, kN·m, m e rad. Informe os eixos e o ponto de referência. Para uma origem deslocada, informe o vetor do nó à origem nos eixos da fundação. A opção **No nó, nos eixos globais** exibe a matriz transformada. Confirme a associação depois de conferir os 36 valores.

Com `OOFEM_BIN` apontando para o executável fixado em `docs/OOFEM.md`, reproduza os casos com:

```sh
npm test -- tests/foundation.test.ts
npm run test:e2e -- foundation.spec.ts
```

No caso-base, o bloco (UX, RY) é [[10.000, 2.000], [2.000, 4.000]] nas unidades do CSV. As diagonais restantes são 5.000, 6.000, 3.000 e 7.000 em UY, UZ, RX e RZ. Com FX = 22 kN e MY = 8 kN·m, a solução é UX = 2 mm e RY = 1 mrad. Os outros quatro movimentos são zero. As ações do apoio sobre a estrutura, na mesma origem, são −22 kN e −8 kN·m.

No segundo ensaio os eixos giram +90° em Z e a origem da matriz fica 0,5 m acima do nó. Multiplica-se a matriz do CSV pelo movimento de referência na origem e transfere-se o torsor até o nó usando `M_nó = M_origem + r × F`. As ações globais são (5, 22, 18) kN e (−19, 8,5, −7) kN·m. O OOFEM deve fornecer (0, 1,5, 3) mm e (−1, 2, −1) mrad no nó e reações opostas às seis ações. O ensaio compara movimentos com tolerância absoluta de 10⁻¹² m ou rad e reações com tolerância de 10⁻⁹ vezes o maior entre 1 e o módulo de cada referência em SI.

A fatoração aplica Cholesky após equilibrar a diagonal. Verifica a simetria com tolerância absoluta 10⁻⁸ na matriz adimensional e exige pivôs ativos acima de 10⁻¹². Uma liberdade declarada precisa ter linha e coluna nulas na origem. Cada coluna fatorada produz uma mola sobre uma combinação linear dos seis movimentos, por `GeneralSlaveNode`, `SlaveNode` e `NodalSpring`. A orientação e a mudança de origem preservam o trabalho virtual. A reação da fundação no nó é `−K_nó q_nó`.

Em um terceiro ensaio, a suíte monta diretamente `Tᵀ K T` para uma matriz densa, eixos oblíquos e um deslocamento de origem nas três direções. Os 36 termos transformados são comparados com tolerância relativa de 10⁻¹¹ (piso unitário em SI). O teste resolve o projeto reaberto e compara os seis movimentos e as seis reações à referência independente.

A suíte também resolve a exportação F01 com o termo FX–RY negativo, a rotação RX livre do B16 com um vínculo complementar e a matriz diagonal em uma barra espacial frente às molas da KS-25. O teste de interface cobre arquivo inválido com apoio anterior intacto, confirmação de eixos/origem, substituição, desfazer/refazer, salvar, reabrir e executar.

## Força e momento concentrados no vão (KS-29)

Use a viga biapoiada de 6 m do exemplo, retire a carga uniforme e mantenha o apoio articulado em i e o apoio móvel em j. Em **Modelo → Carga concentrada**, clique na barra e ajuste a posição para 2 m a partir de i. Repita a análise com a posição relativa `1/3`. Consulte **Esforços** na mesma estação pelos lados i e j.

| Ação aplicada       | Reação vertical em i | Reação vertical em j | Cortante nos lados i e j | Momento nos lados i e j |
| ------------------- | -------------------: | -------------------: | ------------------------ | ----------------------- |
| FZ global = −12 kN  |                +8 kN |                +4 kN | +8 e −4 kN               | +16 e +16 kN·m          |
| MY global = +6 kN·m |                −1 kN |                +1 kN | −1 e −1 kN               | −2 e +4 kN·m            |

A primeira linha decorre de `Rj = 12 × 2 / 6` e `M(2 m) = 8 × 2` na seção carregada. Na segunda linha o binário produz salto de +6 kN·m no momento. Os testes repetem a força com 2, 3 e 8 subdivisões regulares e invertem i/j. Também verificam a divisão e a união físicas, a superposição de casos, a soma com uma carga nodal coincidente e a aplicação dentro de um braço rígido.

No ensaio espacial, engaste a extremidade (0, 0, 0) e deixe livre a extremidade (3, 0, 4) m. Gire a seção em +90° e aplique Fz local = −10 kN em x/L = 0,4 com fator 1,5 no caso. A força resultante é +15 kN em Y global. A reação é −15 kN em Y, com momentos +24 kN·m em X e −18 kN·m em Z. A inversão de i/j conserva as reações globais. Os ensaios de esforços usam tolerâncias absolutas de até 0,005 N ou N·m na comparação com a saída numérica.

```sh
OOFEM_BIN=/caminho/absoluto/oofem npm run check
OOFEM_BIN=/caminho/absoluto/oofem npm run test:e2e -- member-point-loads.spec.ts
```

## Cargas triangulares, trapezoidais e parciais (KS-30)

Abra a viga de referência de 6 m e zere a carga uniforme. Em **Modelo → Carga por trecho**, clique na barra. Escolha o referencial global, início a 2 m de i e fim a 5 m. Informe qZ nas duas extremidades e analise cada linha abaixo separadamente. As posições relativas equivalentes são 1/3 e 5/6.

| qZ inicial e final (kN/m) | Força vertical resultante (kN) | Posição da resultante a partir de i | Reação em i (kN) | Reação em j (kN) |
| ------------------------- | -----------------------------: | ----------------------------------- | ---------------: | ---------------: |
| 0 e −6                    |                             −9 | 4 m                                 |               +3 |               +6 |
| −2 e −6                   |                            −12 | 3,75 m                              |             +4,5 |             +7,5 |
| −6 e +6                   |                              0 | Binário de −9 kN·m em Y global      |             +1,5 |             −1,5 |

Para conferir cada seção no OOFEM, tome `d = min(3, max(0, x − 2))` e `g = (q₁ − q₀)/3`. A carga acumulada até x é `Q = q₀d + gd²/2`. O cortante é `V = Rᵢ + Q` e o momento é `M = Rᵢx + (x − 2)Q − q₀d²/2 − gd³/3`. Os testes com 2, 4 e 12 subdivisões comparam todas as estações às expressões, com tolerâncias absolutas de 0,06 N no cortante e 0,6 N·m no momento. Os esforços nas extremidades dos elementos são impressos pelo OOFEM com cinco algarismos significativos. A comparação da superposição inclui o arredondamento de cada parcela.

A força integrada em um trecho de comprimento ℓ vale `F = ℓ(q₀ + q₁)/2`. O momento em relação ao ponto médio vale `(r₁ − r₀) × ℓ(q₁ − q₀)/12`. A terceira linha verifica esse momento mesmo com força resultante zero. Outro ensaio aplica a inversão de sinal inteiramente no braço rígido. Um balanço de (0,0,0) a (3,0,4) m, com giro de +90°, recebe qz local de −2 a −6 kN/m entre 1 e 4 m e fator 1,5. As reações de referência no engaste são −18 kN em Y, +39,6 kN·m em X e −29,7 kN·m em Z.

Uma viga biengastada de 6 m com carga triangular de 0 a −6 kN/m em todo o vão verifica também a compatibilidade de rotações. As reações verticais são +5,4 e +12,6 kN, e os momentos de engastamento nas seções i e j são −7,2 e −10,8 kN·m.

A suíte compara a distribuição constante de ponta a ponta com o carregamento uniforme legado, inclusive deslocamentos. Também cobre inversão de i/j, divisão, união, cópia, superposição e envelopes. No navegador, o ensaio verifica o lançamento por clique, a troca de sinal nas setas, as estações do diagrama e do CSV, edição, desfazer/refazer e reabertura. A perspectiva XYZ verifica a ação em eixos locais.

```sh
OOFEM_BIN=/caminho/absoluto/oofem npm run check
OOFEM_BIN=/caminho/absoluto/oofem npm run test:e2e -- member-distributed-loads.spec.ts
```

## KS-31 · recalques e rotações prescritos

No exemplo de dois vãos, posicione A, B e C em X = 0, 4 e 8 m. Use seção de 0,30 × 0,40 m e E = 18,75 GPa, resultando em EI = 30.000 kN·m². Restrinja UZ nos três apoios e UX em A. Deixe RY livre e retire as cargas externas. No inspetor, abra **Movimentos prescritos**, escolha o padrão ativo no caso e informe −4 mm para UZ em B. Analise e consulte **Deslocamentos**, **Reações** e **Esforços**.

| Ensaio                    | Resultado analítico e verificação                                                                                                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recalque diferencial em B | Com L = 4 m e δ = 0,004 m, cada reação extrema vale 3EIδ/L³ = +5,625 kN. A reação central vale −11,25 kN. O momento sagente na seção B vale +22,5 kN·m nos dois lados. Ensaios com 2 e 9 elementos por vão comparam reações, equilíbrio e momento com tolerâncias de 0,1 N e 0,1 N·m. |
| Translação uniforme       | Imponha −4 mm nos três apoios. As estações repetem o deslocamento com tolerância de 10⁻¹² m. As reações verticais e os esforços ficam abaixo de 10⁻⁵ N ou N·m.                                                                                                                        |
| Rotação de extremidade    | Na barra AB de 4 m, impeça as duas translações verticais e as duas rotações. Imponha +1 mrad em RY de A. Os momentos de reação em A e B valem +30 e +15 kN·m, conforme 4EIθ/L e 2EIθ/L. A reação vertical em A vale −11,25 kN.                                                        |
| Apoio inclinado           | Gire os apoios em 30° e prescreva −4 mm em Z local nos três nós, com X local impedido. As componentes globais são +2 mm em X e −3,464102 mm em Z. Uma adulteração do deslocamento impresso pelo solver deve ser rejeitada.                                                            |

Com `OOFEM_BIN` configurado conforme o projeto, execute `npm test -- tests/prescribed-motions.test.ts`. A comparação das condições de contorno usa tolerância absoluta de 10⁻¹² m ou rad, acrescida de 2 × 10⁻⁸ vezes o módulo prescrito para o arredondamento da saída. O ensaio de interface edita o padrão, desfaz, refaz, salva, reabre e consulta o cálculo. [Condição de contorno no OOFEM 3.0](https://github.com/oofem/oofem/blob/v3.0/src/core/boundarycondition.C)

## KS-38 · diagnóstico e inspeção de objetos

`tests/diagnostics.test.ts` cobre um nó isolado conhecido, um componente sem restrições suficientes, uma barra que referencia um nó inexistente e uma singularidade genérica sem destaque arbitrário. O contexto salvo do histórico só permite navegar quando o projeto atual é idêntico ao snapshot da execução. `tests/e2e/diagnostics.spec.ts` cobre o fluxo de análise, seleção do nó e chegada às propriedades.

Com OOFEM 3.0 AMD64 configurado, `npm run check` passou com 217 testes, sem falhas, e `npm run build` passou. O E2E de localizar o nó isolado, navegar para propriedades, corrigir e reanalisar passou em Chromium usando a saída real capturada do OOFEM. A repetição com o comando Playwright do projeto não iniciou porque a porta 1420 já estava ocupada.

## KS-28 · peso próprio por padrão de carga

Ative **Considerar peso próprio neste padrão** em um padrão e escolha a direção global, a gravidade e o multiplicador. A contribuição mostrada para cada barra usa `ρ·A·g` em N/m e o total usa também o comprimento físico. Para painéis horizontais, a contribuição vertical usa `ρ·t·g` em N/m² e a área do painel. Cargas manuais permanecem separadas; a interface sinaliza quando há uma carga manual na mesma direção ou quando um caso soma dois padrões com peso próprio.

Na viga de 6 m, use seção de 0,20 × 0,40 m, `ρ = 2.500 kg/m³`, gravidade de 10 m/s² em −Z e multiplicador 1. A área é 0,08 m², portanto `qZ = −2.000 N/m`, carga resultante −12.000 N e reações esperadas +6.000 N em cada apoio. Multiplicar por 2 dobra a ação; desativar o padrão remove somente a parcela automática.

Na laje horizontal de 4 × 3 m, use espessura de 0,10 m e os mesmos valores de densidade e gravidade. A pressão calculada é −2.500 N/m², o total é −30.000 N e a soma das reações verticais deve ser +30.000 N. Pressão manual permanece listada separadamente. Repetir a exportação, trocar o refinamento e salvar/reabrir não deve mudar o total.

A migração de v19 para v20 cria a configuração automática desativada e preserva as cargas manuais. O exportador recusa gravidade em Y num modelo XZ e direções não verticais para painéis, pois esses componentes não são representados pelos elementos atuais.

Execute `npm run check`, `npm run build` e `npm run test:e2e`. Para repetir os equilíbrios com o solver fixado, configure `OOFEM_BIN` conforme `OOFEM.md` e execute `OOFEM_BIN=/caminho/absoluto/oofem npm test -- tests/oofem.integration.test.ts tests/plate.integration.test.ts`.

O ensaio adicional compara o peso próprio com a mesma intensidade uniforme manual em uma barra de eixo excêntrico com braço rígido e EI modificado. As reações e os esforços coincidem. Um padrão horizontal com fator zero é verificado também em projeto de laje.

## KS-33 — Vento estático por faixa

Ensaio de entrada definida pelo usuário. Em XZ, crie um pilar de (0, 0, 0) a (0, 0, 3) m, engaste a base e deixe o topo livre. Em **Cargas e casos**, adicione uma faixa ao padrão do caso. Use os dois nós do pilar, largura tributária de 4 m, intervalo de 0 a 100%, direção +X, pressão de referência de 0,8 kN/m² e coeficiente +1,25. A face é vertical e perpendicular ao vento, com largura centrada na vertical que recebe as cargas. Para uma fachada apoiada em várias verticais, atribua a cada uma sua largura de influência.

A pressão líquida é o produto da pressão de referência pelo coeficiente. Um coeficiente negativo representa sucção. A força total é a pressão líquida multiplicada pela área da faixa. Sendo t a altura relativa do centro da faixa, a parcela superior é t vezes a resultante e a inferior é (1 − t) vezes a resultante. A distribuição representa a transferência estática aos nós e conserva o momento em relação a qualquer ponto.

| Configuração | FX na base e no topo (kN) | Reação FX na base (kN) | Reação MY na base (kN·m) |
| --- | --- | ---: | ---: |
| Faixa inteira, +X | +6 e +6 | −12 | −18 |
| Faixa inteira, −X | −6 e −6 | +12 | +18 |
| Duas metades, +X | +4,5 e +1,5 na inferior, +1,5 e +4,5 na superior | −12 | −18 |

A prévia da faixa inteira mostra 12 m² e linha de ação horizontal à cota de 1,5 m. Para repartir a fachada, edite a faixa original para 0–50% e adicione outra de 50–100%. No ensaio de combinação, o fator −0,5 para o vento em +X e 1,5 para um caso independente com −1 kN em Z no topo produzem reações de +6 kN em X, +1,5 kN em Z e +9 kN·m em Y.

Com o OOFEM 3.0 configurado conforme [OOFEM.md](OOFEM.md), execute `npm test -- tests/wind.test.ts`. O ensaio XZ admite diferença absoluta inferior a 0,05 N ou 0,05 N·m nas reações. O ensaio espacial aplica sucção a 30° na metade superior de um pilar com base em (8, −2, 10) m. A reação MY calculada de 11.691,343 N·m aparece como 11.691 N·m nos cinco algarismos significativos do OOFEM, com tolerância absoluta de 0,5 N·m. Execute `npm run test:e2e -- wind.spec.ts` para conferir a prévia, o cancelamento, a atualização sem duplicação, o histórico e a reabertura do arquivo.

## KS-32 — temperatura em barras

Abra uma viga biapoiada de 5 m em X, com rotações livres, deslocamento axial livre à direita, E = 200 GPa, α = 12 × 10⁻⁶/K e seção retangular de 5 × 200 mm (área de 1.000 mm²). Retire as cargas mecânicas. Para a versão espacial, impeça UY nas duas pontas e RX na ponta esquerda. No inspetor da barra, abra **Ação térmica** e escolha o padrão usado no caso. Os valores abaixo são relativos ao estado inicial sem variação de temperatura.

| Ensaio                                                         | Referência e resultado do OOFEM 3.0                                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Variação uniforme +20 K, ponta livre em X                      | uX(B) = α ΔT L = +1,2 mm. Normal nula.                                                                                        |
| Mesmo aquecimento, UX impedido nas duas pontas                 | N = −EAαΔT = −48 kN em toda a barra. Reações horizontais opostas de 48 kN.                                                    |
| Diferença T(+z) − T(−z) = +10 K em 0,20 m, variação média zero | κy = (RYj − RYi)/L = +0,0006 m⁻¹. Para a barra no sentido +X, w″ = −κy. A flecha central é +1,875 mm em Z e o momento é nulo. |
| Diferença de −10 K nas mesmas faces                            | Flecha central −1,875 mm.                                                                                                     |
| Espacial, diferença +0,25 K sobre a largura de 0,005 m         | Flecha central +1,875 mm em Y. Girar a seção +90° em torno de X, com +10 K sobre a altura, leva a flecha a −Y.                |

O ensaio compara 2 e 8 elementos e a inversão de i/j. Para os deslocamentos em metros e a curvatura em m⁻¹, o erro absoluto deve ficar abaixo de 5 × 10⁻¹¹. Para a normal impedida admite-se 0,01 N. Para normal ou momento esperados nulos, exige-se menos de 10⁻⁵ N ou N·m. Um segundo padrão com fator −0,5 sobre o mesmo campo produz metade do alongamento e da flecha. Também são exercitados o campo nulo, α nulo e a alteração de EIy. Com braços rígidos de 0,5 m nas duas extremidades, o comprimento deformável cai para 4 m e o alongamento livre para 0,96 mm. A migração conserva as faixas de vento dos projetos v21. No ensaio de coluna de 3 m com ambas as ações, obtêm-se +0,72 mm de alongamento, −12 kN de reação horizontal e −18 kN·m de momento na base.

Configure `OOFEM_BIN` conforme [Configuração do OOFEM](OOFEM.md). Execute `npm test -- tests/thermal-loads.test.ts` e `npm run test:e2e -- thermal-loads.spec.ts`. A regressão usa o executável real e confere os resultados importados. O teste de interface aplica e desfaz a temperatura, salva e reabre o projeto e consulta o deslocamento.

## KS-34 — Fila de casos estáticos

Abra o [pórtico em L](../examples/portico-em-l-envelopes.kstruct.json), selecione **Envelope** e clique em **Analisar casos necessários**. A fila executa EL e CP uma vez cada na ordem do projeto. Se EL já foi analisado na mesma revisão, só CP inicia. Com ambos disponíveis, o comando não faz chamadas nativas.

No envelope, selecione V1 na estação x/L = 0,5. O máximo de My é 11,99 kN·m, governado por CF · Flexão. O teste compara todas as células da tabela desse extremo e do mínimo exibido com as da execução manual dos dois casos, na mesma unidade e precisão de exibição. As tolerâncias numéricas seguem o [benchmark de envelopes](#envelopes-de-esforços).

Com o [OOFEM 3.0 configurado](OOFEM.md), execute `npm run test:e2e -- results.spec.ts -g 'fila serial|pórtico em L com fila'`. A ponte controlada cobre clique repetido, fator zero, dependências duplicadas, cancelamento entre casos e com o motor ativo, falha no segundo caso, histórico e edição antes de uma resposta tardia. O segundo ensaio usa o motor real para comparar fila e execução manual.

## KS-35 — famílias editáveis de ELU e ELS

O ensaio usa coeficientes ilustrativos informados pelo usuário. Lance a viga biapoiada de referência de 6 m e crie três padrões de carga uniforme em −Z, de 1, 2 e 4 kN/m. Crie os casos G, Q1 e Q2 com um padrão por caso, todos com fator 1. No gerador de **Combinações lineares**, classifique G como permanente e Q1 e Q2 como variáveis. Atribua ao ELU os coeficientes 1,2 / 1,5 / 0,75 e ao ELS os coeficientes 1 / 1 / 0,3, na ordem permanente / principal / acompanhante.

| Família e principal | Expressão por caso       | Carga resultante em −Z (kN/m) | Reação em cada apoio (kN) | Momento no meio do vão (kN·m) |
| ------------------- | ------------------------ | ----------------------------: | ------------------------: | ----------------------------: |
| ELU, Q1             | 1,2 G + 1,5 Q1 + 0,75 Q2 |                           7,2 |                      21,6 |                          32,4 |
| ELU, Q2             | 1,2 G + 0,75 Q1 + 1,5 Q2 |                           8,7 |                      26,1 |                         39,15 |
| ELS, Q1             | G + Q1 + 0,3 Q2          |                           4,2 |                      12,6 |                          18,9 |
| ELS, Q2             | G + 0,3 Q1 + Q2          |                           5,6 |                      16,8 |                          25,2 |

Para cada intensidade q, as referências são R = qL/2 e M = qL²/8. Com Q1 e Q2 no mesmo grupo, a prévia de ELU passa a 1,2 G + 1,5 Q1 e 1,2 G + 1,5 Q2. Inserir a outra variável na linha editada deve apontar a exclusão. Atribuir o mesmo padrão a dois casos ativos deve identificar o padrão contado duas vezes. Uma combinação manual idêntica também aparece na validação.

Para reproduzir a comparação numérica, configure `OOFEM_BIN` conforme [Configuração do OOFEM](OOFEM.md) e execute `npm test -- tests/combination-families.test.ts`. O teste resolve os três casos no OOFEM 3.0 e compara o ELU de principal Q1 com um quarto caso independente submetido diretamente com os fatores 1,2, 1,5 e 0,75. A flecha central esperada é −6,075 mm. As reações analíticas e o momento central desse ensaio usam tolerância absoluta de 0,02 N ou N·m, e os deslocamentos, de 5 × 10⁻⁹ m. Na comparação entre esforços ao longo da barra, a impressão nativa `%.4e` limita cada valor a cinco algarismos significativos. A tolerância soma os meios incrementos de arredondamento do caso direto e das parcelas ponderadas, mais 10⁻⁷ N ou N·m para resíduos próximos de zero.

Execute `npm run test:e2e -- results.spec.ts --grep 'gera ELU/ELS'` para reproduzir a edição e dispensa de linhas, desfazer/refazer, salvar, reabrir e regenerar. Com o executável configurado, a fila resolve G, Q1 e Q2 uma vez cada e a interface mostra as duas reações de 21,6 kN. O teste de domínio verifica também a preservação do envelope manual e os IDs das combinações regeneradas.

## KS-36 — Envelopes nodais

Em **Reações de apoio** e **Deslocamentos nodais**, cada extremo é procurado por componente no referencial solicitado. A origem é a combinação linear da qual provêm todas as componentes daquela linha. A primeira combinação na ordem do envelope vence o empate exato. A regra de extremos por componente é descrita no [CSI Analysis Reference Manual, Load Combinations, Types of Combos](https://docs.csiamerica.com/manuals/sap2000/CSiRefer.pdf).

No ensaio controlado, as duas combinações têm o mesmo nome e IDs distintos. Os dois apoios também têm o mesmo nome, e o segundo caso os entrega em ordem inversa.

| Combinação | Fx (kN) | Fy (kN) | Fz (kN) | Mx (kN·m) | My (kN·m) | Mz (kN·m) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 10 | 2 | 30 | −3 | 7 | −2 |
| B | −4 | 20 | 12 | 5 | −6 | −2 |

No primeiro apoio, o máximo de Fx recupera a linha A inteira e o máximo de Fy recupera B. Com o eixo local x na direção (0,6, 0,8, 0), as projeções de Fx são +7,6 kN e +13,6 kN. O máximo local recupera B, com força (13,6, 15,2, 12) kN e momento (−1,8, −7,6, −2) kN·m. O momento Mz empata em −2 kN·m. A inversão da ordem do envelope troca a origem desse empate.

**Viga XZ.** A viga biapoiada de 6 m recebe −10 kN/m. Para os fatores +1 e −2, cada apoio tem reação Fz máxima de +30 kN e mínima de −60 kN, por equilíbrio. No nó inicial, Ry varia de −9 a +4,5 mrad e, no nó final, de −4,5 a +9 mrad. A rotação de extremidade tem módulo |q|L³/(24EI). O teste numérico admite 0,02 N nas reações verticais e 10⁻¹⁰ rad nas rotações.

**Pórtico XYZ.** O modelo de nove nós e três engastes do benchmark espacial recebe o padrão distribuído G e o padrão nodal W. O solver resolve G e W e, em duas execuções independentes, A = 1,2 G + 0,8 W e B = 0,7 G − 1,1 W. O teste confronta ambos os extremos de cada uma das seis componentes com esses casos diretos e verifica o vetor inteiro da origem identificada. Em N7, B governa o máximo de Fy global (+4,236867 kN), enquanto A governa o máximo de Fy local (+3,468888 kN). No CSV global de Fx máximo, N8 recebe B (+2,261141 kN) e N9 recebe A (+2,360680 kN).

Na comparação das saídas impressas, S representa a norma do trio de componentes do caso direto mais a soma das normas dos trios de G e W ponderadas pelos módulos dos fatores. Calcula-se S separadamente para forças, momentos, translações e rotações. A tolerância das reações é 10⁻⁷ + 5,1 × 10⁻⁵ S, em N ou N·m. Para deslocamentos e rotações é 10⁻¹² + 5,1 × 10⁻⁹ S, em m ou rad. O termo proporcional cobre o arredondamento da impressão nativa, inclusive após a projeção.

Configure o executável OOFEM 3.0 em `OOFEM_BIN` e execute os dois ensaios.

```sh
npm test -- tests/nodal-envelopes.test.ts
npm run test:e2e -- results.spec.ts --grep 'envelope nodal'
```

No navegador, o ensaio percorre a fila, consulta nó e apoio, alterna o referencial e compara o CSV antes e depois das trocas kN → N, kN·m → N·m e mm → m. As rotações continuam em mrad. Uma edição da carga retira a tabela e o CSV até a nova análise. [Configuração do OOFEM](OOFEM.md)

## KS-37 — Consulta de diagramas

O comprimento L vai da face i à face j do trecho deformável. No campo x, a distância acompanha a unidade de comprimento selecionada. O campo x/L aceita decimais e frações. A estação de um salto possui duas leituras na mesma abscissa. Uma carga concentrada pode produzir salto no cortante, e um binário concentrado pode produzir salto no momento. A orientação local segue a conectividade i → j. A convenção de indicar a posição a partir da ponta i também aparece na documentação do SAP2000. [Convenções das forças internas em barras](https://docs.csiamerica.com/help-files/sap/Output/Frame_Element_Internal_Forces_Output_Conventions.htm)

**Cálculo.** O OOFEM fornece os esforços de extremidade. Entre duas faces consecutivas, a intensidade distribuída é constante ou linear. O normal e os cortantes são polinômios de grau até dois. As duas ordenadas nativas e o gradiente da intensidade fixam seus coeficientes. O momento fletor é linear em um trecho sem carga transversal. Em um trecho carregado, é de grau até três e fica determinado pelos dois momentos e pelas duas derivadas fornecidas pelos cortantes de extremidade. Nos eixos locais espaciais, dMy/dx = Vz e dMz/dx = −Vy. No plano, dM/dx = V. O domínio dos polinômios termina em cada face da malha. [Relações de equilíbrio por integração](https://engineeringstatics.org/integration_method.html)

A busca compara as duas pontas de cada trecho, as faces dos saltos e as raízes internas da derivada do esforço consultado. No envelope, cada combinação fornece seus próprios candidatos. A leitura na posição vencedora recupera todas as componentes simultâneas daquela origem. Em um resultado que só disponha de estações, a consulta identifica a amostra efetiva. O desenho usa pontos intermediários para traçar as curvas. O CSV de estações continua a exportar as amostras do solver.

| Ensaio | Referência de conferência |
| --- | --- |
| Viga biapoiada, 6 m, força de 12 kN para baixo a 2 m | Lado i com V = +8 kN, lado j com V = −4 kN e M = +16 kN·m nas duas faces. 2 m, 200 cm e x/L = 1/3 consultam o mesmo corte. Invertida a conectividade, o corte fica a 4 m da nova origem, V passa de −4 para +8 kN e M local vale −16 kN·m. |
| Viga biapoiada, 6 m, carga uniforme de 10 kN/m | M máximo = qL²/8 = 45 kN·m em x = 3 m. Nas malhas de 3, 5 e 8 divisões, os maiores momentos amostrados são 40, 43,2 e 45 kN·m. |
| Carga triangular de 0 a 6 kN/m em 6 m | O máximo está em x/L = 1/√3 e vale 13,8564 kN·m. A regressão admite 5 × 10⁻⁵ em x/L e 0,6 N·m no momento, considerando a precisão de impressão das forças de extremidade. |
| Envelope com carga uniforme e combinação de momento constante | A segunda combinação tem 42 kN·m e tração de 5 kN. Governa nas duas estações em x = 2 e 4 m. Entre elas, a primeira combinação governa com 45 kN·m em x = 3 m e normal nulo. |
| Balanço espacial com rotação da seção, peso próprio e carga variável local | As seis componentes em três seções da malha de 3 divisões são confrontadas com as estações coincidentes de uma análise independente com 12 divisões. Tolerância absoluta por componente de 0,02 + 1,1 × 10⁻⁴ vezes o módulo da referência, em N ou N·m. |

A viga com força concentrada usa tolerância de 0,0005 N ou N·m nas faces. Para a viga uniformemente carregada, o teste admite 0,005 N·m no momento máximo e 5 × 10⁻⁹ em x/L. A superposição de +2 kN/m com a carga triangular de 0 a −6 kN/m leva o cortante máximo a +2 kN em x = 2 m. Com quatro subdivisões, a maior amostra vale +1,875 kN. Há ensaios adicionais para o salto de um binário de 6 kN·m, os limites de carregamentos parciais e uma barra inclinada com braços rígidos e 7 m de comprimento deformável.

Com o OOFEM 3.0 indicado em `OOFEM_BIN`, execute os testes abaixo. No navegador, o roteiro cobre cursor, entrada inválida, unidades, frações, faces, troca de combinação governante e invalidação por edição da carga. [Configuração do OOFEM](OOFEM.md)

```sh
npm test -- tests/member-diagram.test.ts
npm run test:e2e -- results.spec.ts --grep 'consulta o diagrama|extremo calculado'
```


## KS-41 · painel poligonal com abertura

Na planta XY, lance o exterior por (0, 0), (6, 0), (6, 2), (3, 2), (3, 4) e (0, 4) em metros. Abra o retângulo entre X = 1 e 2 m e Y = 0,5 e 1,5 m. Adote 0,10 m de espessura, E = 30 GPa, ν = 0,20, apoio simples em todas as bordas externas e bordas livres na abertura. Aplique −5 kN/m² em Z. Com quatro divisões por lado de cada triângulo inicial, o ensaio tem 100 nós e 160 elementos DKT.

O exterior mede 18 m² e a abertura mede 1 m². O centroide da área líquida está em X = 43,5/17 m e Y = 29/17 m. Sobre os 17 m² atuam −85 kN. As reações abaixo incluem as forças verticais e os momentos nodais de apoio, tomados em torno de (0, 0) no plano.

| Grandeza | Equilíbrio analítico | OOFEM 3.0 | Tolerância absoluta |
| --- | ---: | ---: | ---: |
| Soma das áreas | 17 m² | 17 m² na malha | 10⁻¹¹ m² |
| Reação em Z | +85 kN | +84,99951 kN | 0,002 kN |
| Momento das reações em X | +145 kN·m | +144,99888 kN·m | 0,004 kN·m |
| Momento das reações em Y | −217,5 kN·m | −217,49808 kN·m | 0,004 kN·m |

A cobertura é conferida recortando cada triângulo pelos retângulos do furo e do recorte externo. A área de interseção deve ser inferior a 10⁻¹² m² em ambos. Um painel quadrado com furo central exercita a consulta em um ponto material quando o centroide cai na abertura.

O ensaio de apoio oblíquo gira o triângulo (0, 0), (4, 0), (0, 3) no plano, com cosseno 0,8 e seno 0,6. Os catetos são simplesmente apoiados e a hipotenusa é livre. Comparam-se todos os nós correspondentes antes e depois do giro. A flecha se conserva e os vetores globais de rotações e reações acompanham a rotação do painel. Os limites são 10⁻⁹ m ou rad para deslocamentos e rotações, 0,2 N para forças e 0,05 N·m para momentos de apoio. As verificações retangulares de QDKT e DKT continuam comparando flecha, Mx e My com a série de Navier e a soma das reações com 60 kN. [Referência QDKT](#placa-retangular-simplesmente-apoiada) · [Referência DKT](#laje-retangular-isolada)

Com `OOFEM_BIN` apontando para o executável fixado, rode na raiz do repositório.

```sh
npm run check
npm run build
npm run test:e2e
```

Para repetir só as verificações de placas, execute `npm test -- tests/polygon-slab.test.ts tests/plate.integration.test.ts tests/oofem.integration.test.ts` e `npm run test:e2e -- slab.spec.ts`. O ensaio de interface desenha, fecha, corrige e cancela anéis na planta, edita vértice e apoio, desfaz, salva e reabre o painel. A ponte de teste entrega a entrada gerada pelo editor ao executável real e devolve a saída para a consulta dos mapas.

## KS-42 · refinamento e qualidade da malha

Use a placa de 4 × 3 m simplesmente apoiada, com espessura de 0,10 m, E de 30 GPa, ν de 0,20 e pressão de −5 kN/m². Consulte o centro em X = 2 m e Y = 1,5 m a cada análise. Na interface, guarde a primeira referência em **Comparar malhas** antes de editar o tamanho-alvo. Os tamanhos de 0,50, 0,25 e 0,125 m reproduzem as subdivisões 8 × 6, 16 × 12 e 32 × 24 dos ensaios legados retangulares. Cada célula contém um QDKT ou dois DKT.

| Formulação | Alvo (m) | Elementos | UZ (mm) | Mx (kN·m/m) | My (kN·m/m) | Σ RZ (kN) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| QDKT | 0,50 | 48 | −1,026687 | 1,997732 | 3,127024 | 60,00020 |
| QDKT | 0,25 | 192 | −1,029917 | 1,989041 | 3,087367 | 60,00000 |
| QDKT | 0,125 | 768 | −1,030673 | 1,986897 | 3,077772 | 60,00014 |
| DKT | 0,50 | 96 | −1,013955 | 2,025044 | 3,104622 | 59,99980 |
| DKT | 0,25 | 384 | −1,026874 | 1,996033 | 3,082756 | 60,00012 |
| DKT | 0,125 | 1.536 | −1,029932 | 1,988656 | 3,076822 | 59,99996 |
| Navier | — | — | −1,030920 | 1,986133 | 3,074724 | 60,00000 |

O erro absoluto da flecha diminui nas três malhas das duas formulações. Na mais fina, os erros relativos de UZ, Mx e My ficam abaixo de 0,2% da série de Navier. Esse limite admite o erro de discretização dos momentos recuperados. A tolerância absoluta de 3 N no equilíbrio inclui o arredondamento das reações no arquivo de saída do OOFEM. Um ensaio com uma borda refinada verifica a consulta fora dos nós e a invariância ao transladar o retângulo no pavimento. [Referência de Navier e ensaios retangulares](#placa-retangular-simplesmente-apoiada)

No painel em L da KS-41, use tamanho global de 1 m. Acrescente tamanho de 0,25 m nas quatro bordas do furo e na borda externa apoiada de X = 6 m. As bordas selecionadas recebem segmentos de até 0,25 m. Há triângulos da malha inicial que permanecem inteiros longe dessas bordas. A área líquida se conserva em 17 m², sem elementos invertidos, e as consultas no furo e no recorte ficam fora do material.

| Controles locais | Triângulos DKT | Nós | Carga aplicada (kN) | Σ RZ (kN) | Ângulo mínimo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Nenhum | 160 | 94 | −85 | 84,99987 | 7,125° |
| Abertura e borda apoiada | 484 | 271 | −85 | 84,99969 | 7,125° |

O inspetor marca em âmbar triângulos com ângulo inferior a 15° e quadriláteros com razão de distorção inferior a 0,1. O ângulo identifica triângulos esguios. A razão é o menor valor entre o quociente dos Jacobianos extremos e o quociente dos comprimentos de lado extremos. Assim, uma célula retangular muito alongada também recebe alerta. São indicadores para revisão e estudo de convergência. O erro relativo de cobertura da área deve ser de até 10⁻⁹. Uma borda física pertence a um elemento e uma aresta interna a dois.

O critério de degenerescência exige 2A/L² > 10⁻¹⁰ no triângulo e 4Jmín/L² > 10⁻¹⁰ no quadrilátero, com L igual ao maior lado. Essa normalização independe da unidade de comprimento. Os quatro cantos delimitam os extremos do determinante do Jacobiano do mapa bilinear. Orientação invertida ou geometria numericamente singular bloqueia a exportação. O triângulo de 100 m de base e 0,1 m de altura, com vértices sobre os eixos coordenados, produz um alerta. Aumentar a base para 10¹⁰ m torna a malha inválida. A prévia identifica o elemento e sua posição.

Com `OOFEM_BIN` configurado para a versão 3.0 do projeto, reproduza os ensaios numéricos e o fluxo de interface com os comandos abaixo.

```sh
npm test -- tests/slab-sizing.test.ts tests/plate.integration.test.ts tests/polygon-slab.test.ts tests/oofem.integration.test.ts
npm run test:e2e -- slab.spec.ts
```

## KS-43 · vínculo entre duas lajes e viga comum

Abra o [projeto de exemplo](../examples/duas-lajes-viga-comum.kstruct.json) no KStruct desktop. L1 e L2 medem 4 × 3 m cada, com espessura de 0,10 m, E de 30 GPa e ν de 0,20. Em X = 4 m há uma viga de concreto de 0,25 × 0,50 m, entre Y = 0 e Y = 3 m. O primeiro nó restringe UX, UY, UZ e RY. O segundo restringe UX e UZ. As demais bordas externas das lajes têm apoio simples. O padrão G aplica −5 kN/m² apenas em L1. A resultante vertical aplicada é −60 kN.

Em **Modelo → Vínculo entre lajes**, mantenha a mesma viga e altere apenas a ligação à flexão. A orientação da borda no contorno de L1 é +Y. Na tabela, Δθ é a rotação de L2 menos a de L1 nessa direção. M₁ e M₂ são os momentos integrados nas faces de L1 e L2. A força vertical é a ação líquida das lajes sobre a viga. Parte da carga vai diretamente aos apoios externos das placas. As verificações usam o executável OOFEM 3.0 fixado no projeto.

| Malha de cada painel QDKT | Ligação | FZ na viga (kN) | M₁ (kN·m) | M₂ (kN·m) | Máx. abs. Δθ (mrad) |
| --- | --- | ---: | ---: | ---: | ---: |
| 8 × 8 | Articulada | −8,6580 | 0 | 0 | 0,77900 |
| 8 × 8 | Semirrígida | −11,0248 | +1,06815 | −1,06815 | 0,55567 |
| 8 × 8 | Contínua | −17,0378 | +3,76211 | −3,76211 | 0 |
| 16 × 16 | Articulada | −7,8302 | 0 | 0 | 0,78824 |
| 16 × 16 | Semirrígida | −10,6144 | +1,10525 | −1,10525 | 0,56726 |
| 16 × 16 | Contínua | −18,0638 | +4,00786 | −4,00786 | 0 |
| 32 × 32 | Articulada | −7,5477 | 0 | 0 | 0,79056 |
| 32 × 32 | Semirrígida | −10,5755 | +1,11475 | −1,11475 | 0,57018 |
| 32 × 32 | Contínua | −18,8487 | +4,07622 | −4,07622 | 0 |

A ligação semirrígida da tabela usa kθ = 1.000 kN·m/(rad·m). Entre as malhas 16 × 16 e 32 × 32, sua carga na viga varia cerca de 0,37% e o momento integrado, 0,86%. Na contínua, a carga na viga varia cerca de 4,35% no mesmo refinamento. A conservação da carga total e a convergência de uma grandeza local são verificações distintas.

Em cada uma das quatro discretizações de 4 × 4 até 32 × 32, o ensaio varia kθ entre 0,001 e 10⁸ kN·m/(rad·m). No limite flexível, a rotação difere menos de 0,001% da articulada. No limite rígido, a força na viga e o momento diferem menos de 0,1% da contínua. Nesta última a igualdade de rotações é imposta exatamente pelo modelo de graus de liberdade.

A rigidez de cada mola é kθ ℓ, com ℓ igual ao comprimento tributário da estação. As duas meias estações de ponta e as interiores somam 3 m em todas as malhas. Os deslocamentos impressos conferem a lei de mola e as reações das duas faces conferem o momento transmitido no mesmo referencial. O ensaio admite 3 N na soma vertical global, 1 N entre a carga da laje transferida e a reação da viga sem carregamento próprio e 2 N·m na soma dos momentos das faces. Essas tolerâncias incluem o arredondamento das reações e dos esforços no arquivo de saída. A mudança de malha produz uma discretização diferente e os valores de uma malha não são usados como reações esperadas de outra.

### Referência analítica independente

Para isolar a lei da ligação, retire a viga, adote apoio vertical de linha na borda comum e mantenha os apoios exteriores paralelos a ela. Deixe as duas bordas paralelas a X livres. Adote ν = 0 nos dois painéis. O carregamento uniforme em L1 e a geometria são constantes ao longo de Y. A solução de flexão cilíndrica é a de duas faixas de Euler–Bernoulli com vão L = 4 m. A rigidez por metro é D = Eh³/12. Para q = 5.000 N/m², a diferença angular livre, em módulo, é qL³/(24D). Um momento por metro m reduz a diferença em 2mL/(3D). Logo,

$$
|\Delta\theta|=\frac{qL^3/(24D)}{1+2k_\theta L/(3D)},\qquad |m|=k_\theta|\Delta\theta|.
$$

Na contínua, |m| tende a qL²/16. Multiplique m pela largura de 3 m para comparar com o momento integrado do OOFEM.

| Ligação | Momento analítico (kN·m) | OOFEM 12 × 4 (kN·m) | Rotação analítica (mrad) | OOFEM (mrad) |
| --- | ---: | ---: | ---: | ---: |
| Articulada | 0 | 0 | 5,33333 | 5,29630 |
| Semirrígida, kθ = 1.000 kN·m/(rad·m) | 7,74194 | 7,68804 | 2,58065 | 2,56272 |
| Contínua | 15,00000 | 14,89600 | 0 | 0 |

Os valores não nulos diferem menos de 0,7% no ensaio. A regressão admite 3% para a discretização 12 × 4. Outros ensaios cobrem a combinação DKT/QDKT com números de divisões diferentes e viga lançada em sentido inverso, um par de painéis poligonais rodado em planta e o equilíbrio com carregamento próprio da barra. Ao desassociar a viga, o teste mantém a ligação entre as lajes. Quando o apoio exterior coincide com uma extremidade livre da viga, a reação do encontro é contabilizada uma única vez.

Configure `OOFEM_BIN` e execute os ensaios abaixo. [Configuração do OOFEM 3.0](OOFEM.md)

```sh
npm test -- tests/slab-joint.test.ts
npm run test:e2e -- slab.spec.ts -g KS-43
```


## KS-44 · membranas e cascas em planos arbitrários

### Tração e flexão em uma faixa

Abra o [exemplo inclinado](../examples/faixa-inclinada.kstruct.json). O painel tem comprimento de 3 m, largura de 1,20 m e espessura de 0,10 m. O material é elástico isotrópico, E = 30 GPa e ν = 0. A borda DA é engastada e a borda oposta BC recebe tração uniforme q₁ = +100 kN/m e carga transversal q₃ = −1 kN/m. A carga positiva segue os eixos que aparecem no painel. Para reproduzir os ensaios individuais, selecione **Membrana** e zere q₃ ou selecione **Placa em flexão** e zere q₁. A opção **Casca** recebe as duas ações simultaneamente.

Com q₁, a solução uniforme é N11 = 100 kN/m e U1 = q₁ L/(Eh) = +0,100 mm na borda livre. Com q₃, a solução de flexão cilíndrica é U3 = q₃ L³/(3D) = −3,600 mm, onde D = Eh³/12. O ensaio mantém a seção e as cargas locais ao passar do plano XY para o vertical e para uma orientação oblíqua. A orientação oblíqua usa os vetores unitários (1, 2, 2)/3 e (2, 1, −2)/3 para os eixos 1 e 2.

| Subdivisões AB × AD | Média de U3 nos nós de BC (mm) | Referência (mm) |
| --- | ---: | ---: |
| 2 × 1 | −3,604187 | −3,600000 |
| 4 × 2 | −3,598385 | −3,600000 |
| 8 × 4 | −3,599402 | −3,600000 |
| 16 × 8 | −3,599841 | −3,600000 |

Na malha 8 × 4, os três planos reproduzem a tração, a flecha e a superposição na casca. Os testes admitem 0,016 mm de diferença em cada nó livre sob flexão e 0,000001 mm no alongamento. Conferem também o esforço normal em cada ponto de integração, o momento médio, as forças globais e o momento de engaste. Em outro ensaio, a pressão e o peso próprio em Z global são somados com fator de caso 1,3.

### Parede ligada à laje

No [exemplo parede–laje](../examples/parede-laje-em-balanco.kstruct.json), a parede tem 3 m de altura, a laje tem 3 m de balanço e a largura comum é de 1,20 m. A base da parede é o único engaste. O carregamento de −1 kN/m na borda livre da laje totaliza −1,200 kN em Z. Cinco nós compartilhados na borda transmitem os deslocamentos e as rotações. Em relação a A da parede, as reações esperadas são **FZ = +1,200 kN, MX = +0,720 kN·m e MY = −3,600 kN·m**. O teste verifica esses valores, as translações na borda, a compressão no plano da parede e a flecha da laje. O conjunto também é ensaiado após rotação e translação no espaço. A suíte inclui ainda a laje de placa acoplada à parede de casca e um mecanismo ao substituir a parede por uma membrana.

A versão inicial admite um ou dois painéis planos em paralelogramo, espessura uniforme, material isotrópico, uma carga uniforme de borda e uma pressão por painel e padrão. A ligação é contínua em toda a borda, com as mesmas subdivisões nos dois lados. Os engastes são aplicados por borda inteira. O cálculo atende a casos estáticos com fatores de padrão. Os modelos de painéis espaciais e os de pórticos com lajes de pavimento têm rotinas de análise próprias.

## KS-45 · rigidez direcional dos painéis

A cobertura de 6 × 3 m tem espessura de 0,12 m, E = 30 GPa e ν = 0,20. As quatro bordas são engastadas. A pressão de −5 kN/m² produz uma força global de −90 kN em Z. O fator M11 vale 4, os demais valem 1. O eixo geométrico 1 acompanha o vão de 6 m. Abra o modelo, clique em **Analisar**, edite o ângulo em **Cobertura · Casca** e repita a análise. O arquivo usa 32 × 16 subdivisões. [Projeto de exemplo](../examples/cobertura-direcional.kstruct.json)

| Ângulo | U3 central OOFEM (mm) | U3 central Ritz (mm) | M11 geom. OOFEM / Ritz (kN·m/m) | M22 geom. OOFEM / Ritz (kN·m/m) | M12 geom. OOFEM / Ritz (kN·m/m) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0° | −0,20373 | −0,20379 | −1,770 / −1,802 | −1,675 / −1,696 | +0,002 / 0 |
| 45° | −0,12011 | −0,11974 | −1,105 / −1,118 | −1,787 / −1,809 | −0,702 / −0,710 |
| 90° | −0,05991 | −0,05943 | −0,185 / −0,188 | −1,876 / −1,903 | −0,001 / 0 |

A solução independente de Ritz usa uma placa de Kirchhoff e 12 funções de Legendre por direção, multiplicadas por uma função que impõe deslocamento e inclinação nulos nas bordas. O OOFEM fornece U3 no nó central. Para comparar momentos no mesmo local, o ensaio tira a média dos 24 pontos de integração dos seis triângulos incidentes ao centro, sempre nos eixos geométricos fixos. Em todas as orientações, a malha 32 × 16 reduz o erro de flecha da malha 8 × 4 em mais de quatro vezes. O teste aceita até 0,9% para a flecha, 2,5% para os momentos ou 0,003 kN·m/m para momentos próximos de zero, e 0,8 N no equilíbrio vertical. [Cálculo de Ritz em Python e NumPy](../tests/fixtures/roof-ritz.py)

A suíte também verifica extensão e flexão independentes em faixas inclinadas, cisalhamento e torção com sinal a 32° em um paralelogramo oblíquo, invariância da resposta isotrópica ao giro e transmissão de carga com peso próprio no encontro parede–laje. Para reproduzir, configure `OOFEM_BIN` e execute `npm test -- tests/panel-stiffness.test.ts`. Para conferir a referência, execute `python tests/fixtures/roof-ritz.py`.

## KS-46 · pressão hidrostática e carga superficial variável

O exemplo contém uma parede vertical de 3 m de largura e 4 m de altura, com engaste na base. A normal +3 aponta para −X. Para água com peso específico de 9,81 kN/m³, a pressão cresce de zero na superfície até 39,24 kN/m² no fundo. A força horizontal é $F=γbH^2/2$ e o momento de tombamento tem módulo $M=FH/3$. A linha de ação passa pelo meio da largura, a $H/3$ acima da base. [Modelo para abrir no KStruct](../examples/parede-pressao-hidrostatica.kstruct.json) · [Hidrostática de superfícies planas, Universidade de Manchester](https://personalpages.manchester.ac.uk/staff/gregory.f.lane-serff/teaching/PKS_hydr1_notes.pdf)

| Altura molhada | Subdivisões na altura | Reação horizontal OOFEM / analítica (kN) | Momento de tombamento OOFEM / analítico (kN·m) | Altura calculada (m) |
| ---: | ---: | ---: | ---: | ---: |
| 4,00 m | 12 | 235,4403 / 235,4400 | 313,9200 / 313,9200 | 1,333332 |
| 2,30 m | 1 | 77,8415 / 77,84235 | 59,6790 / 59,67914 | 0,766673 |
| 2,30 m | 13 | 77,8422 / 77,84235 | 59,6792 / 59,67914 | 0,766669 |

A segunda e a terceira linhas mantêm a altura física da parede em 4 m e zeram a carga acima de 2,30 m. O teste confere forças e momentos integrados antes da solução e os valores escritos pelo OOFEM. Para as reações admite 3 N na força, 3 N·m no tombamento e 0,05 mm na altura da linha de ação. No modelo completo, o momento aplicado em Y é −313,920 kN·m e o momento de reação em Y é +313,920 kN·m.

Para conferir também o deslocamento, o ensaio de faixa usa a mesma parede em flexão com ν = 0. A solução cilíndrica de balanço dá $w(H)=-p_0H^4/(30D)$, com $D=Eh^3/12$. Para $h=0,25$ m, a flecha de referência vale −8,57211 mm. O OOFEM fornece −8,70217 mm na malha 8 × 4 e −8,58025 mm na malha 32 × 16, com diferença final de 0,095%.

Uma segunda referência usa casca inclinada de área real 10 m² com +8 kN/m² no canto C e zero nos demais. Com fator de caso 1,5, a força global X vale +30 kN e a linha de ação passa a 2/3 de AB e de AD, medidos a partir de A. As placas DKT e QDKT de 4 × 3 m recebem ainda uma distribuição linear de −3 a +3 kN/m². O ensaio verifica força vertical nula e momento aplicado de −24 kN·m em Y. A suíte também verifica uma abertura, a transferência de carga para uma viga comum e a persistência do projeto. Com `OOFEM_BIN` configurado, execute `npm test -- tests/surface-pressure.test.ts`.

## KS-47 · distribuição de cargas de painel às vigas

O pórtico de referência tem quatro pilares engastados na base e vigas de contorno de 6 × 4 m, na cota +3 m. Um painel aplica −5 kN/m² em Z no padrão G. A área é 24 m² e a força de −120 kN passa pelo centro, em (3, 2, 3) m. Em relação à origem do modelo, os momentos da força são −240 kN·m em X e +360 kN·m em Y. O OOFEM calcula +30 kN de reação vertical em cada base nos três modos. [Abrir projeto](../examples/portico-painel-de-carga.kstruct.json)

| Modo | Vigas de 6 m (AB e CD), por viga | Vigas de 4 m (BC e DA), por viga |
| --- | --- | --- |
| Vão AB | 0 | 12 m² e −60 kN, carga constante de −15 kN/m |
| Vão AD | 12 m² e −60 kN, carga constante de −10 kN/m | 0 |
| Duas direções | 8 m² e −40 kN, trapézio com patamar de −10 kN/m entre 2 e 4 m | 4 m² e −20 kN, triângulo com pico de −10 kN/m no meio |

Um ensaio separado engasta diretamente as quatro extremidades do perímetro. Para uma viga biengastada sob carregamento simétrico de módulo $w(s)$, o módulo do momento de engaste é $M_e=\int_0^L w(s)s(L-s)^2/L^2\,ds$. O momento positivo no meio do vão é $-M_e + RL/2 - \int_0^{L/2} w(s)(L/2-s)\,ds$, com $R$ igual à metade da carga da viga. Esses valores independem da rigidez dos pilares do exemplo.

| Borda, duas direções | Cortante na extremidade (kN, módulo) | Momento de engaste (kN·m, módulo) | Momento no meio (kN·m, módulo) |
| --- | ---: | ---: | ---: |
| 6 m | 20 | 24,4444 | 13,8889 |
| 4 m | 10 | 8,3333 | 5,0000 |

O teste confronta esses esforços com a saída do OOFEM para 2, 8 e 16 subdivisões por barra, com tolerâncias de 1 N e 1 N·m. Confira também o caso de dois painéis vizinhos, no qual a viga comum recebe 40 kN, e a combinação de ações globais em X e Z com carga manual e fator negativo. Execute `OOFEM_BIN=/caminho/para/oofem npm test -- tests/tributary-loads.test.ts`. O teste de interface em `tests/e2e/slab.spec.ts` percorre o lançamento, a prévia por viga, o histórico, a reabertura, a exportação e a análise.

## KS-48 — Cortes da estrutura

OOFEM 3.0, revisão `214b161`. Os ensaios em `tests/section-cuts.test.ts` usam a saída do processo nativo. Forças e momentos abaixo atuam sobre o lado negativo do plano. A referência independente soma as ações do corpo livre. As grandezas internas do aplicativo estão em N e m.

| Modelo e malha | Grandeza | Corte | Corpo livre |
| --- | --- | ---: | ---: |
| Balanço XZ e XYZ, 3 e 8 elementos | Fz / My a 1 m | −10,000 kN / +30,000 kN·m | −10,000 / +30,000 |
| Parede, 8 × 4 células | Fx / Fz / My | +1,19999 kN / +120,000 kN / +2,49999 kN·m | +1,200 / +120,000 / +2,508 |
| Parede, 16 × 8 células | Fx / Fz / My | +1,20001 kN / +120,000 kN / +2,52739 kN·m | +1,200 / +120,000 / +2,508 |
| Pavimento, 12 × 12 por laje | Fz / Mx / My | −9,47114 kN / +12,19675 kN·m / −10,18556 kN·m | −9,47108 / +12,31082 / −10,18360 |
| Pavimento, 20 × 20 por laje | Fz / Mx / My | −9,15461 kN / +12,24300 kN·m / −8,91220 kN·m | −9,15469 / +12,29695 / −8,91167 |

**Balanço.** Comprimento de 4 m, engaste em X = 0 e força de −10 kN em Z na ponta. O polo fica na interseção. O ensaio inverte o lado e a conectividade i/j, acrescenta uma força de −3 kN exatamente no plano e verifica um corte dentro de uma zona rígida carregada. Tolerâncias do balanço simples de 0,1 N e 0,4 N·m. Uma ação no plano pertence ao corpo retido em cada consulta.

**Parede.** Casca vertical de 3 × 1,2 m, engastada na base, com tração na borda livre de +100 kN/m no eixo longitudinal e −1 kN/m na normal local. Corte a 0,91 m da base e O no meio da largura. O braço livre mede 2,09 m. Tolerâncias de 0,12 N para as forças e 2,5% do momento de referência. A integração discreta do momento de casca varia com a malha.

**Pavimento.** Exemplo `duas-lajes-viga-comum.kstruct.json`, ligação elástica de 10⁶ N·m/(rad·m), plano Y = 0,81 m e O = (4, 0,81, 3) m. Na malha 12 × 12, as parcelas de Fz em kN são −4,39220 na viga, −5,08593 em L1 e +0,00699 em L2. O corpo livre independente inclui as reações exteriores, o apoio da viga e a pressão de −5 kN/m² sobre a faixa retida de L1. As ações da interface se cancelam nessa referência. Tolerâncias de 1 N em Fz, 5 N·m em My e 2,5% em Mx. O ensaio verifica também a inversão do lado. Em ambas as malhas da parede e do pavimento, a mudança do polo satisfaz M(O′) = M(O) + (O − O′) × F dentro de 10⁻⁷ N·m.

A consulta bloqueia o total em coincidências físicas, em decomposições indeterminadas ou com parcela elementar ausente. Os testes cobrem a reabertura do corte salvo, reavaliação da geometria, tolerância em arestas internas, ponto tangente e corte vazio. O teste de interface usa uma saída de viga capturada do OOFEM.

A recuperação de cortante por equilíbrio do tensor fletor também pode ser consultada no [código do DKT do OOFEM 3.0](https://github.com/oofem/oofem/blob/214b161ed3acb471f2d0104b004c37fd73bafaa2/src/sm/Elements/Plates/dkt.C).
