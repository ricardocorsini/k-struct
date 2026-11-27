# KStruct

**Análise estrutural open source, parte do ecossistema OpenStruct.**

KStruct faz referência à matriz de rigidez **[K]**. A direção do produto é um ambiente completo de lançamento, análise e interpretação de estruturas, com a fluidez de trabalho de ferramentas como SAP2000 e uma identidade própria.

![Interface inicial do KStruct](docs/images/editor.webp)

## Recursos no código atual

O editor trabalha com projetos **planos XZ** ou **espaciais XYZ** e usa a mesma seleção na vista de lançamento, na perspectiva 3D e no explorador.

- Lançar barras e nós em planta XY ou elevações XZ/YZ, com eixos, pavimentos, modo ortogonal e snap em referências ou passos de 0,50 m.
- Mover nós e barras, espelhar módulos e replicar por translação ou rotação com prévia. Escolher os apoios e padrões de carga das cópias e conectar interseções em 3D.
- Editar coordenadas, apoios rígidos ou elásticos em referenciais globais ou inclinados, ligações rígidas, livres ou elásticas nas pontas das barras, seções retangulares, circulares, tubulares e I, orientação da seção e cargas globais.
- Escolher unidades de comprimento, seção, deslocamento, força, momento, carga distribuída e módulo de elasticidade em **Exibição → Unidades**. A escolha fica nas preferências locais.
- Aplicar forças e momentos nos nós ou ao longo das barras, além de cargas uniformes. Em **Modelo → Carga concentrada**, clique na barra e ajuste a distância a partir de i ou a fração x/L (por exemplo, `1/3`). Escolha o padrão de cargas e o referencial global ou local. O inspetor permite editar e excluir cada ação. A malha cria ou reaproveita o nó de análise na posição indicada e conserva a barra física inteira. A tabela de esforços e o CSV identificam os lados i e j da seção. O peso próprio pode ser ativado por padrão em **Cargas**, com direção, gravidade e multiplicador.
- Aplicar cargas distribuídas em todo o comprimento ou em parte da barra. Em **Modelo → Carga por trecho**, clique perto do início da carga, informe o início e o fim a partir de i (em distância ou x/L) e as intensidades nas duas pontas. Para um triângulo, deixe uma ponta com intensidade zero. Para um trapézio, use intensidades diferentes. Sinais opostos invertem as setas ao longo do trecho. O inspetor reúne as cargas do padrão ativo para edição.
- Lançar uma laje isolada em planta XY, por dois cantos ou por contorno poligonal com aberturas. Editar bordas, apoios, pressão e malha e consultar mapas de flecha e momentos.
- No inspetor da barra, abra **Excentricidades e trechos rígidos** para deslocar o eixo de inserção em coordenadas globais e informar os comprimentos rígidos nas pontas i e j. As vistas mostram os braços e as faces. A tabela de esforços e o CSV identificam a posição da seção no espaço.
- Importar no apoio de um nó espacial a matriz 6 × 6 de uma fundação do MolaStruct, conferir suas entradas e associar eixos e origem. A fundação fica disponível no projeto para análise offline.
- Prescrever recalques e rotações em graus rígidos do apoio por padrão de carga. O painel de deslocamentos permite conferir o valor imposto e o calculado no caso ou na combinação.
- Aplicar temperatura por barra e por padrão no inspetor, em **Ação térmica**. Informe a variação média e a diferença entre faces da seção em K. A vista indica a face mais quente. Para o material, use o coeficiente de dilatação linear α em 1/K.
- Lançar **Modelo → Painel espacial** em um projeto XYZ vazio. Os pontos A, B e D definem um paralelogramo horizontal, vertical ou inclinado. Escolha membrana, placa em flexão ou casca, indique as bordas engastadas e aplique cargas nos eixos locais. Dois painéis podem compartilhar uma borda com subdivisões compatíveis. Consulte deslocamentos e esforços por painel, nó e ponto de integração. [Faixa inclinada](examples/faixa-inclinada.kstruct.json) · [Parede e laje em balanço](examples/parede-laje-em-balanco.kstruct.json)
- Em **Painel espacial → Orientação e rigidez**, gire os eixos a partir de AB e ajuste os fatores de membrana e de flexão. Em **Exibição → Eixos e faces dos painéis**, confira o sentido de 1, 2 e da normal +3. Nos resultados, escolha os eixos resistentes ou os geométricos para comparar esforços. [Cobertura de exemplo](examples/cobertura-direcional.kstruct.json)
- Em **Modelo → Painel espacial → Carga superficial**, escolha pressão na normal +3 ou carga nos eixos globais X, Y ou Z. A intensidade pode ser uniforme, variar entre duas cotas globais Z ou ser informada em cada vértice. A vista mostra o sentido das cargas e os resultados exibem a força e o momento aplicados e as reações. Na laje horizontal, use **Propriedades → Configurar carga superficial**. [Parede com pressão hidrostática](examples/parede-pressao-hidrostatica.kstruct.json)
- Em **Modelo → Painel de carga**, escolha três nós de um retângulo horizontal e a direção do vão. Confira a área, a força e a carga linear de cada viga antes de aplicar. A distribuição em duas direções usa bissetrizes a 45°. [Pórtico com painel de 6 × 4 m](examples/portico-painel-de-carga.kstruct.json)
- Salvar e reabrir `.kstruct.json` no esquema v33, com migração dos projetos v1 a v32 na abertura. Desfazer e refazer até 50 edições e recuperar o último rascunho local.
- Executar o OOFEM 3.0 integrado nos pacotes Windows e Linux, com diagnóstico, cancelamento e histórico local.
- Resolver a estática linear com `Beam2d` ou `Beam3d`. Consultar os seis componentes de reações, deslocamentos e esforços no modelo espacial, além de deformada, diagramas, CSV e saída do OOFEM.
- Invalidar resultados após alterações. Verificar conectividade, apoios de cada componente e equilíbrio global antes de apresentar resultados.

No navegador, use o editor e a exportação de entrada. O botão **Analisar** executa o solver nativo na aplicação desktop.

## Instalar e executar

Encontre o KStruct no [Struct Launcher](https://openstruct.com.br/launcher). Consulte a [distribuição desktop](docs/DISTRIBUTION.md) para baixar os pacotes avulsos e conferir a instalação.

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

Para explorar os envelopes de esforços, baixe o [projeto de exemplo do pórtico em L](examples/portico-em-l-envelopes.kstruct.json) e siga o [roteiro de análise e conferência](examples/README.md).

1. Abra **Viga de referência**. Ela contém 6 m de vão, seção 15 × 20 cm, E = 200 GPa e carga de −10 kN/m em Z.
2. Selecione a barra ou um nó em qualquer vista ou no explorador. As propriedades aparecem à direita.
3. No desktop instalado, clique **Analisar**. Reações esperadas de 30 kN por apoio, momento de meio de vão 45 kN·m e flecha −8,4375 mm.
4. Altere a carga e analise novamente. A edição remove os resultados anteriores.
5. Para começar do zero, use **Novo projeto** para XZ ou **Novo pórtico espacial** para XYZ. Ative **Barra** (`B`) e marque duas extremidades. Defina apoios e cargas antes de analisar.

No modelo espacial, defina os eixos e as cotas em **Eixos e pavimentos**. Escolha o pavimento para lançar vigas em planta e alterne para uma elevação para lançar pilares. **Orto** alinha a segunda extremidade no plano. Segure `Shift` para inverter o modo durante o clique. Use `Ctrl` ou `Shift` para montar uma seleção e **Replicar** para copiar a geometria até outro pavimento. Use **Conexões da malha** para ligar um nó interno, um montante ou duas barras que se cruzam em XYZ. Em **Editar barras**, a opção **Dividir** cria peças físicas independentes.

Para lançar um banzo contínuo, crie a barra entre os nós extremos e lance os montantes nas posições desejadas. Em **Modelo → Conexões da malha**, escolha o banzo, o nó de cada encontro e **Conectar**. Ative **Malha de análise** na vista para inspecionar os pontos regulares e os anéis das conexões. Em **Esforços**, o mesmo ID de barra reúne todo o diagrama. **Lado i** e **Lado j** identificam os limites da seção quando a carga ou o montante transfere esforço.

Para transformar a seleção, abra **Replicar** no modelo espacial ou **Transformar** no modelo plano. Escolha a operação. Em **Mover por vetor**, expanda **Barras incidentes** para conferir os comprimentos antes e depois do movimento. Para espelhar, indique um ponto e a reta em XZ ou o plano em XYZ. Na rotação, defina o centro, o eixo, o passo angular e o número de cópias. Por exemplo, um passo de +90° em torno de Z, com centro na origem, leva (2, 0, 0) a (0, 2, 0).

As cópias preservam seção e orientação. Por padrão, os novos nós ficam livres e sem carga. Marque **Copiar apoios** e os padrões que deseja levar. Ao reutilizar um nó com dados conflitantes, escolha entre conservar os dados existentes ou unir vínculos e somar cargas dentro do mesmo padrão. Uma cópia girada ou espelhada conserva a direção física do vínculo. Se essa direção for oblíqua, o novo nó recebe um referencial local. Confirme para aplicar toda a operação em uma edição, que pode ser desfeita de uma só vez.

Em **Modelo → Duplicidades**, informe a tolerância na unidade de comprimento selecionada e selecione um par para destacá-lo nas vistas. Por exemplo, 0,001 m corresponde a 1 mm. Escolha o nó ou a barra que conservará o ID. A lista de barras considera as uniões de nós já marcadas e reconhece extremidades invertidas. Confira os apoios, as incidências, as seções, as cargas por padrão e os grupos na prévia. **Aplicar correções** registra uma edição no histórico. **Cancelar** descarta as escolhas. Ao reabrir o diagnóstico, os pares mantidos independentes voltam a aparecer.

Em **Modelo → Editar barras**, selecione uma barra para **Dividir**, **Aparar** ou **Prolongar**. Na divisão, a distância parte do nó inicial i. Para ajustar uma ponta, indique i ou j e escolha um nó, uma coordenada global ou outra barra como referência. Quando o corte atinge o interior de outra barra, a prévia inclui seus novos trechos e ambos usam o mesmo nó. Para **Unir**, selecione as barras com `Ctrl` e abra o comando. Confira as extensões, os padrões de carga e as resultantes antes de aplicar. Uma operação corresponde a um passo de desfazer.

Em **Barra** (`B`), escolha o **Traçado**. **Dois pontos** lança uma barra por par de cliques. **Em cadeia** aproveita a última extremidade para o próximo trecho. **Vão entre eixos** destaca o intervalo entre duas guias consecutivas e o lança com um clique. Aponte para o interior do vão para indicar a direção. Escolha a seção ativa e, em XYZ, a rotação em graus. `Esc` encerra o lançamento e **Desfazer** remove um trecho por vez.

Em **Modelo** → **Tabela de nós**, edite as coordenadas de vários nós na unidade de comprimento selecionada (metros por padrão). A tabela mostra X e Z no modelo plano e X, Y e Z no espacial. Use vírgula ou ponto para decimais e corrija as células destacadas antes de clicar em **Aplicar**. A tabela verifica as posições finais do lote. Se uma barra ficar com comprimento nulo ou abaixo da tolerância, a mensagem identifica a barra e você pode corrigir as coordenadas dos dois extremos antes de aplicar. **Cancelar** descarta o rascunho. **Desfazer** e **Refazer** atuam sobre o lote inteiro. Após aplicar uma alteração, analise novamente para atualizar os resultados.

Em **Colar planilha (TSV)**, escolha a unidade das coordenadas copiadas e cole os nós e as barras. Confira os IDs e os comprimentos na prévia antes de aplicar. Uma barra pode usar nós criados no mesmo lote.

Nos modos **Nó** e **Barra**, aproxime o cursor do ponto médio de uma barra ou da perpendicular a partir do último ponto. Para posicionar a próxima extremidade por incremento, informe os dois valores Δ na unidade exibida e pressione **Enter**.

Em **Exibição → Unidades**, selecione as unidades para cada grandeza e clique em **Aplicar unidades**. Por exemplo, o vão de 6 m aparece como 600 cm ou 6000 mm, e E = 200 GPa aparece como 200000 MPa. Os campos, eixos, pavimentos, réplicas, modelos paramétricos, vistas e tabelas acompanham a escolha. A troca preserva o modelo, o histórico e os resultados da revisão atual. O arquivo do projeto e a entrada OOFEM continuam em SI. O CSV identifica as unidades selecionadas e conserva o formato existente ao usar as preferências padrão. Rotações das tabelas continuam em mrad; pressão da laje em kN/m² e momentos da laje por metro de largura mantêm unidades explícitas.

Em **Exibição → Arranjo de vistas**, escolha **Planta + elevação + perspectiva** para acompanhar um pórtico espacial nos três painéis. Clique ou dê foco ao painel em que quer trabalhar. A faixa acima do desenho identifica a vista ativa e sua cota. Os controles de plano e eixo atuam nessa vista. Zoom, enquadramento, nomes, grelha e cargas podem ser ajustados em cada painel. Trocar de vista cancela o trecho em andamento e preserva as peças já lançadas. No projeto plano, use a elevação XZ sozinha ou ao lado da perspectiva.

![Planta do segundo pavimento, elevação XZ e perspectiva do pórtico com a viga B3 selecionada](docs/images/vistas-simultaneas.webp)

No modo **Selecionar** das vistas 2D, arraste da esquerda para a direita para conter objetos inteiros ou da direita para a esquerda para incluir os que cruzam a janela. `Ctrl` ou `Shift` adiciona o conjunto. `Esc` cancela o arraste. Em **Seleção e grupos**, combine tipo, pavimento, material e seção. Um pavimento inclui barras com as duas extremidades na mesma cota. Escolha **Aplicar critérios**, dê um nome e use **Salvar seleção como grupo** para recuperar as mesmas peças depois de reabrir o arquivo. Os grupos guardam os IDs dos objetos.

Em **Exibição → Tema**, escolha **Claro** ou **Escuro**. A primeira abertura usa o tema escuro. A escolha é guardada nas preferências locais e vale para a interface e as duas vistas, inclusive durante a consulta de resultados.

Em **Exibição → Eixos locais**, mostre a seta x de i para j e a tríade nas vistas. Selecione uma ou mais barras para mostrar os eixos apenas dessa seleção. Em 2D, ⊙ indica um eixo que aponta para quem observa e ⊗ indica o sentido oposto. No diagrama de esforços, a barra selecionada mostra os valores em i (`x/L = 0`) e j (`x/L = 1`).

No inspetor da barra, **Inverter i/j** troca o início e o fim, mantendo o ID, a seção na mesma orientação física e as cargas globais. Confira o novo sentido e a projeção local do padrão de carga ativo. Em XYZ, edite **Rotação em torno de x local** para girar fisicamente a seção. Em XZ, o giro da seção fica fixo em 0°. A inversão e a edição do ângulo entram no histórico e exigem nova análise.

Em **Novo projeto**, escolha **Viga contínua** para informar os vãos em X ou **Pórtico regular** para definir vãos e alturas dos pavimentos. No modelo espacial, informe também os vãos em Y. Confira as quantidades de nós e barras na prévia e clique em **Gerar projeto**. Os nós começam livres e as cargas podem ser lançadas no editor.

### Atribuição em lote

Selecione nós e barras com Ctrl ou recupere um grupo em **Seleção e grupos**. Em **Propriedades → Atribuição em lote**, escolha a seção, os graus a restringir ou liberar e as componentes de carga a somar, substituir ou remover no padrão ativo. A prévia identifica os objetos afetados. Quando há apoios inclinados, abra **Referenciais dos nós selecionados** para conferir a direção de cada vínculo. As cargas nodais e distribuídas usam eixos globais.

Por exemplo, em duas barras com qZ de −2 e −3 kN/m, **Somar** −1 kN/m produz −3 e −4 kN/m. **Aplicar lote** registra toda a operação em uma edição. **Desfazer** recupera a seção, os vínculos e as cargas anteriores de cada objeto.

### Diafragma rígido de pavimento

No projeto espacial, escolha **Planta XY** e o **Pavimento ativo**. Abra **Modelo → Diafragmas**, dê um nome ao piso e marque os nós que ele vincula. A seleção de nós feita na vista também pode iniciar a lista. As coordenadas X e Y identificam a referência do movimento no pavimento. Use **Usar centro dos nós** para recalculá-la ou informe outra posição. Ao aplicar, a planta mostra os vínculos tracejados e um losango na referência.

O piso compartilha as translações no plano e a rotação em torno de Z. Cada nó conserva suas liberdades de deslocamento vertical e de rotação em torno de X e Y. Consulte **Deslocamentos** e **Reações** pelos nomes dos nós físicos. Ao editar ou excluir participantes, a referência salva conserva suas coordenadas. A exclusão que deixa menos de dois participantes também remove o diafragma. **Desfazer** recupera a edição inteira. [Ensaio com carga excêntrica](docs/VALIDATION.md#ks-27--diafragmas-de-pavimento)

### Apoios inclinados e molas nodais

Selecione um nó e escolha **Local** em **Propriedades → Apoios e restrições → Referencial do apoio**. Em XZ, informe o ângulo da tangente em graus a partir de +X no sentido de +Z. Confira a prévia e clique em **Aplicar referencial**. Um rolete bloqueia apenas a translação Z local, que corresponde à normal, e deixa livres a translação X local e a rotação Y. Em XYZ, informe a direção de x local e uma direção para y. O editor mostra a base ortonormal de mão direita antes de aplicar. As cargas nodais continuam expressas em XYZ globais.

Analise o caso e abra **Reações**. Quando houver um apoio local com reação, a tabela e o CSV incluem colunas globais e locais, com unidades e o referencial de cada apoio. Em XZ, RX local corresponde à tangente e RZ local à normal. Para reproduzir a viga de 6 m com rolete inclinado, mantenha o nó inicial global e aplique −36,86989765° ao nó final da **Viga de referência**. [Valores esperados](docs/VALIDATION.md#ks-20--apoios-inclinados)

Para definir apoio elástico, abra **Molas nodais** em **Apoios e restrições**. Desmarque a restrição rígida da direção e informe a rigidez de translação na unidade de força por comprimento ou de rotação na unidade de momento por radiano. Zero libera a direção. Os campos indicam o eixo global ou local conforme o referencial do nó. Em **Análise**, consulte as reações e os deslocamentos globais. Com molas inclinadas, a tabela de deslocamentos também mostra a projeção nos eixos do apoio. [Ensaios de molas nodais](docs/VALIDATION.md#ks-25--molas-nodais)

### Materiais do projeto

Em **Modelo → Materiais**, cadastre o módulo E na unidade selecionada (GPa por padrão), o coeficiente de Poisson ν, a massa específica ρ em kg/m³ e a dilatação linear α em 1/K. Ao editar um material compartilhado, confira em **Uso no projeto** os nomes e a quantidade de seções e lajes afetadas. **Salvar material** aplica a alteração a esses usos.

Para testar outro módulo, selecione o material, clique em **Duplicar material**, edite a cópia e salve. Escolha a seção em **Seção ou laje de destino** e clique em **Atribuir material**. Se várias barras usam a mesma seção e apenas uma deve mudar, use **Duplicar seção**, atribua o novo material à seção copiada e escolha essa seção no inspetor da barra. Cada atribuição pode ser desfeita. Para excluir um material em uso, reatribua primeiro as seções e lajes listadas.

### Seções de barras

No explorador do **Modelo**, expanda **Seções** e clique no nome de um perfil. O botão **Catálogo de seções** também abre o catálogo pelo inspetor de uma barra. Em **Nova seção**, escolha a forma e o material, dê um nome e informe as dimensões na unidade de seção selecionada (cm por padrão). O tubo usa diâmetro externo e espessura de parede. O perfil I usa altura total, largura das mesas e espessuras de mesa e alma.

Para aplicar o perfil, selecione a barra e altere **Seção da barra**. Para lançamentos novos, use **Seção ativa**. O inspetor mostra o contorno, os eixos locais, a área e as propriedades Iy, Iz e J na unidade de seção elevada à segunda e à quarta potência, respectivamente. Editar uma seção compartilhada atualiza todas as barras que a referenciam. Analise novamente o modelo para obter os resultados da nova revisão.

Para ajustar uma única barra, abra **Modificadores de rigidez** no inspetor. Informe fatores adimensionais para EA e EIy em XZ, ou EA, EIy, EIz e GJ em XYZ. A tabela mostra a rigidez bruta e a efetiva lado a lado. Use 1 para a rigidez de catálogo. Os fatores precisam ser positivos, pois zerar uma rigidez pode introduzir um mecanismo. Copiar ou dividir a barra conserva os fatores. [Ensaios de rigidez](docs/VALIDATION.md#ks-24--modificadores-de-rigidez)

### Laje retangular isolada

1. Abra **Novo pórtico espacial**, deixe a **Planta XY** ativa e selecione o pavimento. Ative **Laje** (`L`) e clique em dois cantos opostos do painel.
2. Nas propriedades, informe os lados e a espessura nas unidades selecionadas (m e cm por padrão), o material, as bordas com apoio simples, as subdivisões em X/Y e a **Pressão pZ** em kN/m² para o padrão escolhido. O sinal negativo indica pressão para baixo. Em **Elemento de placa**, o quadrilateral **QDKT** usa apoio simples nas quatro bordas. O triangular **DKT** permite liberar bordas e requer pelo menos duas apoiadas.
3. Salve o projeto. No desktop, selecione o caso estático e clique em **Analisar**. O seletor de visualização oferece os mapas de **Flecha UZ**, **Momento local Mx** e **Momento local My**. O painel de resultados mostra os valores no centro e a soma de reações em Z.
4. Para reproduzir a [placa de referência QDKT](docs/VALIDATION.md#placa-retangular-simplesmente-apoiada), use 4 × 3 m, espessura de 10 cm, E = 30 GPa, ν = 0,20, as quatro bordas apoiadas e pZ = −5 kN/m². Repita com 8 × 6, 16 × 12 e 32 × 24 subdivisões.

O fluxo de laje admite um painel isolado ou duas lajes adjacentes no mesmo pavimento, com resultados por caso estático. As propriedades do painel e da malha são guardadas no arquivo. Edições, desfazer e refazer descartam os resultados da revisão anterior.

### Laje poligonal com aberturas

Em **Modelo → Laje poligonal**, marque os vértices na planta XY do pavimento. Para posicionar um vértice com precisão, informe ΔX e ΔY a partir do anterior. Feche o anel pelo primeiro vértice, por **Enter** ou por **Fechar contorno**. Use **Desfazer vértice** para corrigir o traçado ou **Esc** para cancelá-lo.

Com o painel lançado, escolha **Abertura na laje**, desenhe o novo anel e feche-o. As bordas externas começam simplesmente apoiadas e as das aberturas começam livres. Para editar, selecione a laje, escolha o contorno e o vértice no inspetor. O vínculo corresponde à borda que vai desse vértice ao próximo. Ao inserir um vértice na borda, ambos os trechos recebem o vínculo anterior. **Desfazer** recupera cada edição, inclusive a malha retangular original quando se abre um furo em um retângulo existente.

A pressão e o peso próprio atuam sobre a área líquida. Os mapas de resultados mostram apenas o material e identificam o ponto da consulta. Quando o centroide cai em um vazio, a tabela informa as coordenadas de um ponto material próximo. [Ensaio do painel em L com abertura](docs/VALIDATION.md#ks-41--painel-poligonal-com-abertura)

### Refinamento e qualidade da malha de laje

Selecione a laje e abra **Configurar malha da laje**. Em **Geração da malha**, escolha as subdivisões existentes ou **Tamanho-alvo**. Informe o tamanho global na unidade de comprimento do projeto. Para concentrar elementos, escolha uma borda, as bordas apoiadas ou todas as bordas de uma abertura, informe o tamanho local e clique em **Adicionar controle à prévia**. No retângulo, o tamanho controla os lados das células em X e Y. As linhas atravessam o painel e cada célula DKT é dividida pela diagonal. No polígono, o tamanho controla os lados dos triângulos e a transição ocorre entre vizinhos.

A prévia mostra os elementos, os nós e as ocorrências de qualidade. Escolha uma ocorrência para localizar o elemento e suas coordenadas. Um alerta permite prosseguir. Um elemento inválido bloqueia a aplicação da malha e a exportação ao OOFEM. O modo por tamanho aceita até 8.192 nós e 8.192 elementos por painel. **Aplicar malha** registra a edição no histórico e no arquivo do projeto.

Após analisar, abra **Comparar malhas**, informe X e Y de um ponto sobre a laje e clique em **Guardar referência desta malha**. Altere a discretização e analise novamente. A tabela mostra UZ, Mx e My no mesmo ponto, a reação vertical total do painel e a diferença em relação à referência. A referência fica na sessão enquanto a geometria, os apoios, o material e o carregamento do caso permanecem os mesmos. [Ensaios de refinamento](docs/VALIDATION.md#ks-42--refinamento-e-qualidade-da-malha)

### Vínculo entre lajes e viga comum

Lance duas lajes na planta XY do mesmo pavimento. Os dois extremos da borda comum devem coincidir. Para apoiar as lajes em uma viga, lance uma barra entre esses extremos e defina os apoios da estrutura que recebe essa viga.

Selecione a borda na planta ou abra **Modelo → Vínculo entre lajes**. Em **Apoio da borda comum**, escolha **Sem apoio externo**, **Apoio vertical de linha** ou a viga coincidente. Em **Ligação à flexão**, escolha **Articulada**, **Semirrígida** ou **Contínua**. A semirrígida recebe a rigidez rotacional por metro de borda, em kN·m/(rad·m) nas unidades padrão. A viga recebe a carga vertical pelas estações comuns. A rotação em torno da borda governa o momento que passa de uma laje à outra.

Ao analisar, os mapas das duas lajes usam a mesma escala. A tabela da borda mostra os momentos nas duas faces, a rotação relativa e a carga vertical transmitida à viga. Abra as estações para consultar momentos por metro. O exemplo abre com 1.000 kN·m/(rad·m) e carga em apenas uma das lajes. [Abrir projeto de exemplo](examples/duas-lajes-viga-comum.kstruct.json) · [Valores de referência](docs/VALIDATION.md#ks-43--vínculo-entre-duas-lajes-e-viga-comum)

### Padrões, casos, combinações e envelopes

Abra **Cargas e casos** para criar padrões como permanentes, sobrecarga ou vento Y e definir casos estáticos com os fatores de cada padrão. Em **Modelo**, selecione o padrão no qual deseja trabalhar e atribua as ações pelos campos de propriedades de cada nó ou barra.

Para gerar vento estático, abra **Cargas e casos → Padrões → Adicionar faixa de vento**. Selecione dois nós na mesma vertical e informe a largura de fachada que descarrega nessa vertical. O intervalo de 0 a 100% cobre toda a altura entre os nós. A prévia indica a área, a linha de ação e as duas parcelas nodais. **Aplicar definições** grava as faixas no padrão selecionado. Reabra uma faixa para substituir suas parcelas ou use **Cancelar** para descartar a edição. [Exemplo de fachada de 4 × 3 m](docs/VALIDATION.md#ks-33--vento-estático-por-faixa)

No desktop, escolha um caso estático em **Caso, combinação ou envelope** e clique em **Analisar**. Repita para os demais casos. O seletor alterna entre os resultados da revisão atual.

Ao selecionar uma combinação ou envelope, a **Fila de casos** mostra os casos necessários em ordem de execução. **Analisar casos necessários** reaproveita os resultados da revisão atual e executa os pendentes em série. Depois de cancelar ou corrigir uma falha do motor, use o mesmo comando para retomar. Uma edição do modelo exige resultados da nova revisão.

Em **Análise → Cortes da estrutura**, informe um ponto do plano, a normal em XYZ, o lado retido e o ponto de redução O. A prévia destaca as barras e superfícies atingidas. Escolha um caso analisado ou uma combinação linear para consultar Fx, Fy, Fz, Mx, My e Mz por objeto e no total. **Salvar corte** guarda as coordenadas no projeto. Uma edição da geometria exige nova análise. Os ensaios do balanço, da parede e do pavimento estão em [Validação da KS-48](docs/VALIDATION.md#ks-48--cortes-da-estrutura).

Para combinar os resultados, abra **Cargas e casos** → **Combinações lineares** e cadastre os casos e seus fatores. Informe ao menos um fator diferente de zero. Depois de aplicar as definições e analisar os casos com fatores diferentes de zero, selecione a combinação em **Caso, combinação ou envelope**. O KStruct exibe a composição, a deformada, os diagramas e as tabelas. Os CSVs identificam a origem das linhas e registram os IDs e fatores dos casos que compõem cada combinação.

Na aba **Esforços** de um caso ou combinação, use **Barra** para filtrar as estações da tabela e do CSV. A opção inicial é **Todas as barras**. Quando dois nomes coincidem ou uma barra se chama “Todas as barras”, o seletor, a tabela e o CSV identificam as barras pelo ID seguido do nome, por exemplo, `[V2] Viga`. O filtro acompanha a troca de resultados do projeto e volta a **Todas as barras** se a barra selecionada for removida.

Em **Cargas e casos → Combinações lineares → Gerar famílias ELU/ELS**, classifique os casos como permanentes ou variáveis. A tabela mostra os padrões e os fatores já aplicados em cada caso. Para duas direções alternativas de vento, por exemplo, atribua o mesmo grupo de exclusão. Informe os fatores da família para a ação permanente, a principal e as acompanhantes, e registre a origem desses valores. É possível cadastrar mais de uma família ELS ou ELU.

Na prévia, confira a expressão por caso, edite os coeficientes ou dispense linhas. Use **Usar linhas selecionadas** e **Aplicar definições** para confirmar em uma única edição. A regeneração preserva as combinações manuais, os IDs usados pelos envelopes e as linhas editadas pelo usuário. **Usar proposta recalculada** permite substituir uma edição anterior. As famílias alimentam a fila e os envelopes dos pórticos planos e espaciais.

Em **Cargas e casos** → **Envelopes**, dê um nome ao envelope e marque as combinações que participam. Depois de analisar seus casos, selecione o envelope e o componente de esforço. As curvas indicam o mínimo e o máximo com sinal nas estações da malha. Clique no diagrama ou escolha **Barra** e **Estação x/L** para consultar a combinação governante de cada extremo e todos os esforços que atuam simultaneamente naquela seção. O CSV inclui as estações de todas as barras para o componente em exibição, com IDs e fatores para rastrear cada extremo. Uma edição do projeto ou das definições descarta os resultados em memória.

Para ler um diagrama de barra, abra **Consultar seção** em um caso ou combinação. Em um envelope, abra **Esforços nas barras**. Escolha a barra e a componente, informe **x** na unidade de comprimento ou **x/L** como decimal ou fração (por exemplo, `1/3`) e pressione Enter. O cursor e a tabela usam a mesma posição, medida da face i à face j do trecho deformável. Nos saltos, **Face** alterna entre os dois limites. Também é possível clicar no diagrama da vista de trabalho.

**Ir ao mínimo** e **Ir ao máximo** percorrem a barra escolhida. **Trechos e faces** inclui os extremos internos dos trechos com lei de esforço conhecida. **Apenas amostras** restringe a busca às estações do OOFEM. A tabela indica a origem da leitura e, nos envelopes, a combinação e o vetor simultâneo de cada extremo. [Ensaios da consulta de diagramas](docs/VALIDATION.md#ks-37--consulta-de-diagramas)

Para consultar um extremo nodal, selecione o envelope e abra **Reações de apoio** ou **Deslocamentos nodais**. Escolha o apoio ou nó, a componente e, em um apoio inclinado, o referencial. Cada linha mostra o mínimo ou máximo com sinal, a combinação que o produziu e as componentes simultâneas. **CSV** exporta a seleção nas unidades em uso. **Todos os apoios** inclui duas linhas por apoio, com a origem e os eixos de cada vetor. As reações são forças e momentos do apoio sobre a estrutura, aplicados no nó indicado. Para obter a ação da estrutura sobre a fundação, inverta o sinal das forças e dos momentos no mesmo ponto e referencial. [Ensaio dos envelopes nodais](docs/VALIDATION.md#ks-36--envelopes-nodais)

Use `V` para selecionar, `N` para criar nó, `B` para criar barra, `L` para lançar laje, `Esc` para cancelar lançamento, `Delete` para excluir seleção, `Ctrl+Z` para desfazer, `Ctrl+Shift+Z` para refazer e `Ctrl+S` para salvar. Na elevação, scroll aproxima e afasta, botão central arrasta. A vista 3D orbita ao arrastar.

### Medidas de serviço

Em **Análise → Medidas de serviço**, escolha o tipo, os nós ou a barra e o eixo global. A diferença entre nós segue de A para B. A deriva usa o nó superior menos o inferior em X ou Y, dividido pela altura entre os dois. Para a flecha relativa, informe a posição entre as faces i e j do trecho deformável. A tabela mostra o deslocamento da seção, o da corda e a diferença. Um envelope indica as combinações que governam a medida completa.

Use **Salvar medida** para guardar a definição e a origem no projeto. Ao reabrir, analise novamente os casos necessários. A escala visual da deformada pode ser alterada durante a inspeção. [Ensaios da KS-50](docs/VALIDATION.md#ks-50--medidas-de-serviço)

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
OOFEM_BIN=/caminho/absoluto/oofem npm run test:e2e -- spatial.spec.ts load-cases.spec.ts slab.spec.ts
cargo test --manifest-path crates/solver-runner/Cargo.toml
```

Veja [validação e limites](docs/VALIDATION.md), [arquitetura](docs/ARCHITECTURE.md) e [sequência de desenvolvimento](docs/ROADMAP.md).

## Licenças

Código original KStruct sob MIT. Os pacotes desktop incluem o OOFEM como executável independente, com sua licença LGPL-2.1-or-later, fontes correspondentes e instruções de compilação. [Avisos de terceiros](THIRD_PARTY_NOTICES.md).

Desenvolvimento inicial. Cada ampliação da capacidade de análise deve ser acompanhada por casos de referência e verificações numéricas específicas.
