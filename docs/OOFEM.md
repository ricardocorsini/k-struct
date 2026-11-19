# Motor OOFEM

Os pacotes desktop incluem o OOFEM 3.0 x86-64 no commit `214b161ed3acb471f2d0104b004c37fd73bafaa2`. Consulte [distribuição desktop](DISTRIBUTION.md) para instalar ou compilar os pacotes.

## Seleção do executável

O caminho explícito em **Configurar OOFEM** tem prioridade. Se estiver vazio, uma instalação usa o motor integrado, com conferência do manifesto e do SHA-256. Um build de desenvolvimento sem o motor integrado procura o caminho absoluto de `OOFEM_BIN`, depois `oofem` no `PATH`. Projetos estruturais não definem o executável.

No modo de desenvolvimento, use uma distribuição local do [OOFEM 3.0](https://github.com/oofem/oofem/releases/tag/v3.0), preservando as bibliotecas que acompanham o executável. Exemplo para um pacote Linux em `/opt/oofem`:

```sh
export OOFEM_BIN=/opt/oofem/bin/oofem
export LD_LIBRARY_PATH=/opt/oofem/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
npm run desktop:dev
```

No PowerShell, mantendo as DLLs no local indicado pela distribuição:

```powershell
$env:OOFEM_BIN = 'C:\OOFEM\bin\oofem.exe'
npm run desktop:dev
```

Em um checkout do KStruct com as ferramentas de compilação instaladas, use `npm run oofem:stage` e `npm run desktop:dev -- --config src-tauri/tauri.distribution.conf.json` para desenvolver com a distribuição integrada.

**Testar motor** resolve a viga de referência com o executável selecionado e confere as reações e a flecha. Uma instalação incompleta ou com SHA-256 divergente aponta o motivo no diagnóstico.

## Proveniência

O pin está em `crates/solver-runner/oofem.json`. O script `scripts/stage-oofem.mjs` registra o gerador, a versão do CMake, as opções de compilação e os hashes em `oofem/manifest.json`. O arquivo `oofem/BUILD.txt` descreve como compilar a partir das fontes incluídas.

A distribuição compila a mecânica estrutural sem MPI, VTK ou bindings Python. No Linux, o pacote preserva o executável original em um arquivo gzip para impedir que o gerador do AppImage o modifique. O KStruct o extrai em um diretório temporário privado, verifica o SHA-256 e usa o runtime padrão C/C++ do sistema. O executável Windows é compilado com o runtime C/C++ do MSVC incorporado. A biblioteca do OOFEM é compilada dentro do seu executável, invocado em um processo independente por KStruct.

## Contrato de análise

- Um passo de `StaticStructural`. O modelo plano usa `Beam2d` no domínio `2dBeam`. O espacial usa `Beam3d` no domínio `3dShell`, com seis graus de liberdade por nó.
- Barras retangulares elásticas com ligações rígidas e cargas uniformes e nodais. O peso próprio é atribuído como carga.
- `beamShearCoeff = 1e18` aproxima a hipótese de Euler–Bernoulli.
- `Beam3d` usa inércias Iy/Iz e a constante de torção de Saint-Venant calculada pela série para uma seção retangular maciça.
- Uma execução ativa por vez, com diretório temporário, prazo de 60 s e limite de 32 MB por arquivo de saída.
- Cancelar termina o processo e preserva as mensagens disponíveis no histórico. O histórico inclui origem e versão do motor, data, duração, estado e a parte final de stdout e stderr quando o limite do log é atingido.
- Resultados de uma execução cancelada, incompleta ou de um modelo já alterado ficam fora das vistas e tabelas de resultados.
