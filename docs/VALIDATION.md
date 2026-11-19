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

## Verificações adicionais

Persistência sem perda, rejeição de versões desconhecidas e referências quebradas, remoção de cargas dependentes, desfazer/refazer, identidade de nós no snap, componentes sem restrições suficientes, Y não nulo, nós dentro de barras não subdivididas, mapeamento determinístico e saída truncada.

A soma global de forças e momentos é conferida com tolerância relativa de 0,1% à soma dos módulos das contribuições (mais escala unitária). A saída textual do OOFEM usa precisão menor para esforços que para deslocamentos. Equilíbrio é uma verificação complementar e não substitui benchmarks de rigidez nem análise de convergência.

Uma saída real capturada também testa renderização e descarte de resultados obsoletos substituindo somente a fronteira IPC. O job numérico executa adicionalmente o runner Rust com o OOFEM real.

Os testes de interface cobrem desenho a partir de um projeto vazio, edição de carga, histórico, salvar/abrir, erro de solver no navegador e exportação da entrada. A CI verifica o layout mínimo de 1100 × 720 e produz uma captura em `test-results/kstruct-workspace.png`.

Na CI, Playwright usa o Chrome disponibilizado pelo runner Ubuntu e registra sua versão no log. Localmente, utiliza o Chromium instalado pelo próprio Playwright. A renderização 3D dos testes usa SwiftShader.

## Distribuição e regressão em pórtico

O pórtico XZ de dois pavimentos tem pilares com propriedades diferentes, dois carregamentos uniformes e forças e momento nodais. A [referência independente](../tests/fixtures/portal-reference.py) monta a matriz de rigidez por barras de Euler–Bernoulli com Python e NumPy. A integração compara as reações nas bases, translações e rotações de cobertura e momentos de extremidade da viga superior.

O [workflow de pacotes](https://github.com/ricardocorsini/k-struct/actions/workflows/desktop-packages.yml) repete os benchmarks com o executável produzido em cada plataforma. Ele instala o NSIS e o .deb e testa o AppImage extraído. Cada pacote é submetido ao autoteste nativo sem OOFEM no PATH e com acesso externo desabilitado para a execução de teste. O relatório registra as reações e a flecha da viga, e o workflow confere os hashes do executável e do arquivo-fonte instalado.

Os testes do runner exercitam cancelamento, tempo limite e persistência de registros. O Playwright verifica as ações de cancelar, recuperar o histórico e consultar o diagnóstico usando a fronteira IPC simulada, enquanto os testes dos pacotes executam o OOFEM real.

## Pórtico espacial de dois pavimentos

O [modelo de referência](../tests/fixtures/portal-spatial.json) tem nove nós, onze barras e três bases engastadas. Os pavimentos estão a 2,8 m e 6 m. Na cobertura, uma barra oblíqua tem seção girada em 27°, com carga uniforme em X, Y e Z. O nó N5 recebe forças em Y e Z e momentos em X e Z.

A [referência independente em NumPy](../tests/fixtures/portal-spatial-reference.py) usa rigidez direta, um elemento analítico por barra e cargas nodais consistentes. A integração compara todas as translações e rotações nodais, as seis componentes das reações nas bases e os esforços locais das duas extremidades de cada barra. Na referência, UY em N5 é 6,84634 mm e o My inicial da barra oblíqua é 4,31978 kN·m. O OOFEM escreve forças com menos algarismos que deslocamentos. A tolerância de comparação dos esforços e reações é 0,01 N ou N·m mais 0,006% do valor de referência.

O teste Playwright lança o modelo do vazio, altera eixos e cotas, replica vigas, lança pilares em duas elevações, aplica apoios e cargas, salva, reabre e exporta a entrada do OOFEM. Com `OOFEM_BIN`, resolve a entrada exportada, compara os valores com a solução independente e exercita as tabelas e diagramas espaciais entregando a saída real na fronteira IPC. O job numérico executa esse fluxo com a tag exata 3.0.

Um balanço espacial com rotação de seção de 90° verifica também a extensão axial, a flexão em ambos os planos e a torção pelas expressões fechadas de Euler–Bernoulli e Saint-Venant.

## Ainda não validado nesta etapa

Flambagem/P–Δ, massas/modal, combinações/envelopes, cascas, liberações, offsets, molas acopladas, dimensionamento e desempenho em grandes modelos.
