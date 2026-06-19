# Pitfalls Research

**Domain:** Adicionar autonomia real (sobrevivência, combate, building, tech-tree, grounding, provider cloud) a um agente Mineflayer + LangGraph existente — milestone v2.0 "Autonomia de Verdade". Foco em armadilhas de **integração com o que o v1.0 já entregou**.
**Researched:** 2026-06-19
**Confidence:** HIGH (failure modes verificados nos issue trackers do Mineflayer/pathfinder + post-mortems de agentes Voyager/mc-agents; integração com débitos conhecidos do v1.0 confirmada via PROJECT.md/SUMMARYs)

> **Escopo deliberado.** Este arquivo NÃO repete os 9 pitfalls genéricos do v1.0 (think-every-tick, JSON inválido, pathfinder-hang, oscilação de objetivos, crescimento de memória, reconexão, anti-cheat, Bun↔Mineflayer, races de física) — eles continuam válidos e estão em `.planning/milestones/v1.0-research/PITFALLS.md`. Aqui o foco é o que **quebra ao plugar as features novas no sistema existente**. Onde uma armadilha nova se conecta a um débito v1.0, ela é marcada **[INTEGRAÇÃO]**.
>
> **Fases referenciadas** são as do roadmap v2.0 a ser criado. Como o roadmap ainda não existe, o mapeamento usa os agrupamentos lógicos das features (P1/P2 do FEATURES.md): **Grounding**, **System 1 reflexo**, **Crafting/Smelting**, **Tech-tree DAG**, **Modos autônomo/assistente**, **Building**, **Combate**, **Provider LLM**, **Aprendizado/reflexão**. O orquestrador alinha esses nomes às fases reais.

---

## Critical Pitfalls

### Pitfall 1: Grounding superficial — verificar "sucesso da chamada" em vez de "mudança no mundo" [INTEGRAÇÃO]

**What goes wrong:**
A correção do bug confirmado do v1.0 ("peguei 10 tábuas" alucinado) é feita de forma incompleta: a primitiva passa a retornar `{ok: true}` quando `bot.craft()` **resolve sem lançar**, mas não confere o inventário antes/depois. `bot.craft`, `bot.placeBlock` e `bot.collectBlock` podem resolver a Promise enquanto o efeito real falhou ou foi parcial (servidor com lag, item consumido mas resultado não recebido, bloco colocado e imediatamente quebrado por física). O LLM continua recebendo "sucesso", a memória/reflexão registra um fato falso, e a **cadeia de objetivos da tech-tree corrompe** — o bot "acha" que tem bancada e tenta craftar picareta, que falha em cascata.

**Why it happens:**
"Promise resolveu = ação aconteceu" é a suposição natural. Em Mineflayer várias primitivas resolvem no envio do pacote ou num evento que pode ser disparado por outra causa (ver `placeBlock` ignorando blockUpdates sem mudança de tipo, issue de melhoria do check de sucesso). Grounding é confundido com tratamento de exceção.

**How to avoid:**
- **Verificação por delta de estado, não por retorno da chamada.** Snapshot do inventário (contagem por item) **antes**, executar, snapshot **depois**; o resultado reportado é `depois - antes`, não o que o LLM ou a Promise disseram. Mesmo padrão para posição (movimento) e existência de bloco (placement/mine).
- **Toda primitiva retorna um `ActionResult` tipado** (`{intent, expected, observed, ok}`) onde `ok = observed satisfaz expected`. O LLM só pode relatar `observed`.
- **O relato em chat e o registro em memória consomem `observed`, nunca o plano.** Fechar o caminho pelo qual o texto do LLM vira "fato" na memória.
- **Padrão mc-agents `status.json`/`events.json`:** o estado real flui por um canal separado do raciocínio do LLM.

**Warning signs:**
Inventário no jogo diverge do que o bot diz no chat; reflexão registra "craftei X" mas o item não existe; cadeia de tech-tree avança no log mas trava na prática; objetivos dependentes (precisam de bancada/ferramenta) falham logo após um "sucesso".

**Phase to address:** **Grounding (primeira fase de gameplay do v2.0)** — é pré-requisito de crafting, smelting, tech-tree e do aprendizado por reflexão. FEATURES.md já marca como "pré-requisito de TUDO em progressão". Construir antes das features que dependem dele.

---

### Pitfall 2: Reflexo de sobrevivência (System 1) compete com a deliberação single-flight → deadlock ou comida tardia [INTEGRAÇÃO]

**What goes wrong:**
A camada reflexa nova (comer/fugir/abrigo) precisa agir em sub-segundo, mas o sistema v1.0 tem **uma inferência por vez (single-flight, D-12)** e já teve **starvation da reflexão (B1)** porque o lock ficava preso. Dois modos de falha ao adicionar System 1:
1. O reflexo tenta passar pelo mesmo caminho deliberativo e fica esperando o lock do LLM → o bot leva dano/morre enquanto "pensa".
2. O reflexo dispara `bot.consume()`/`pathfinder.goto(fugir)` **ao mesmo tempo** que a deliberação está executando uma ação física (minerando, navegando) → duas ações físicas concorrentes no mesmo `bot`, comportamento indefinido (a navegação cancela o ataque, o consume interrompe o dig).

**Why it happens:**
O arbiter reativo do v1.0 era um *fallback* quando o LLM não decidia — não um sistema concorrente real. Promovê-lo a System 1 (mc-agents) exige que ele **interrompa** o System 2, não que espere por ele. E o single-flight protege a *inferência*, não a *atuação física*.

**How to avoid:**
- **Separar o lock de inferência do lock de atuação.** System 1 NUNCA chama o LLM (é puro heurístico/evento) — então o single-flight do LLM não o afeta. O que precisa de mutex é o **corpo físico** (`bot`): um único "executor de ação física" por vez.
- **Preempção, não fila.** Quando um reflexo crítico dispara (vida crítica, mob adjacente, lava), ele **cancela** a ação física em curso (`pathfinder.stop()`, abortar o craft/dig) e assume o controle. A deliberação é notificada de "fui preemptado" e re-planeja com o novo estado.
- **Prioridades duras vs. macias (liga com Pitfall v1.0 #4):** só vida-crítica/perigo-imediato preempta; fome marginal NÃO interrompe um craft quase pronto (senão volta a oscilação). Histerese no gatilho do reflexo.
- **Re-testar o `[reflect]` ao vivo** (Known Gap do v1.0) DEPOIS de introduzir o System 1, porque a nova camada muda quando o lock do LLM fica livre.

**Warning signs:**
Bot morre de fome/dano "pensando"; ataque e navegação se cancelando no mesmo instante (bot anda em direção ao mob mas nunca bate); log mostra reflexo enfileirado atrás de inferência; regressão do B1 (reflexão nunca dispara) reaparece ao adicionar o System 1.

**Phase to address:** **System 1 reflexo** — e a separação inferência-lock vs. atuação-lock deve ser decisão de design ANTES de escrever o reflexo, não retrofit (mesma lição do two-rate do v1.0).

---

### Pitfall 3: Regressão do "grudar no jogador" — o comportamento que o usuário ODEIA volta [INTEGRAÇÃO]

**What goes wrong:**
O arbiter reativo do v1.0 tende, ao vivo, a **seguir/vagar** (Known Gap explícito) e houve até um fix recente "para o re-navigate infinito no socializing quando já perto do jogador" (commit `0b4dc64`). Ao adicionar o **modo assistente**, três regressões prováveis:
1. O assistente não tem **condição de saída** clara → o bot fica preso atendendo/seguindo o jogador indefinidamente e nunca volta ao autônomo (contradiz o Core Value).
2. O System 1 ou o GoalFollow continua ativo em paralelo ao loop autônomo → o bot "gravita" para o jogador mesmo sem pedido, recriando o grude.
3. Prioridade do objetivo-assistente nunca decai → mesmo concluído, continua sendo o objetivo de maior prioridade.

**Why it happens:**
Modelar "assistente" como um **modo/estado paralelo** (uma máquina de modos separada) em vez de um objetivo com TTL/condição-de-saída. E resíduos do comportamento social do v1.0 (GoalFollow do socializing) coexistindo com a hierarquia nova.

**How to avoid:**
- **Assistente = objetivo de alta prioridade com condição-de-saída explícita**, não um modo (decisão já no FEATURES.md). Ao satisfazer a condição (item entregue, bloco quebrado) ou estourar o TTL, o objetivo é **descartado** e o curriculum autônomo retoma. Sem objetivo-assistente ativo → modo autônomo é o default por construção.
- **Auditar e neutralizar o GoalFollow/socializing do v1.0:** seguir o jogador só pode acontecer DENTRO de um objetivo-assistente ativo, nunca como comportamento de fundo. O fix do `0b4dc64` é um band-aid; o v2.0 deve remover a fonte (re-navigate em socializing).
- **Teste de regressão dedicado:** "sem pedido pendente, o bot se afasta e faz suas coisas?" — deve ser um critério de aceite ao vivo, não unitário.
- **Decaimento/expiração do objetivo-assistente** para garantir que nunca domine a hierarquia depois de concluído.

**Warning signs:**
Bot fica perto do jogador sem motivo; após atender um pedido, continua seguindo; nunca seleciona um objetivo da tech-tree quando há um jogador por perto; re-navigate em loop quando já próximo (sintoma exato do `0b4dc64`).

**Phase to address:** **Modos autônomo/assistente** — com o teste de regressão "não gruda" como gate ao vivo. O usuário explicitamente odeia esse comportamento; tratar como requisito de primeira classe.

---

### Pitfall 4: Tech-tree sem autocraft nativo — resolução recursiva de receitas que não termina ou pede a estação errada

**What goes wrong:**
Mineflayer **não tem autocraft mágico**: `bot.recipesFor(itemType, metadata, minResultCount, craftingTable)` só retorna receitas viáveis **com o inventário e a estação atuais**. Erros comuns ao montar a cadeia madeira→tábuas→bancada→picareta→pedra→ferro:
1. Chamar `recipesFor` para um item 3x3 **sem passar o `craftingTable`** → retorna vazio → o resolvedor conclui (erroneamente) "impossível" e o objetivo morre, OU entra em recursão infinita tentando produzir o ingrediente que ele já tem.
2. Resolver dependências sem **detectar ciclos / profundidade** → stack overflow ou loop (tábua precisa de tronco, mas o resolvedor re-expande tábua).
3. Tentar craftar 3x3 sem uma **bancada colocada e alcançável** (a `craftingTable` precisa ser um `Block` real no mundo, não a noção de "tenho uma na mochila") — e o mesmo para fornalha no smelting.
4. **Equipar a ferramenta errada** para minerar o próximo tier (cavar ferro com picareta de pedra OK, mas diamante com picareta de ferro obrigatória; minerar sem a ferramenta certa não dropa nada → grounding reporta "0 obtido" e o objetivo trava).

**Why it happens:**
Tutoriais de Voyager assumem skill library gerada por LLM que esconde a resolução de receitas. Aqui ela é hand-authored (decisão correta) mas é justamente a parte difícil. `minecraft-data` é a fonte de verdade das dependências e é fácil ignorá-la em favor de regras hard-coded que quebram entre versões.

**How to avoid:**
- **Resolvedor recursivo com `minecraft-data` + memo + limite de profundidade.** Para cada item-alvo: tem no inventário? sim→pronto; não→`recipesFor` (passando a estação se disponível); para cada ingrediente faltante, recursão. Memoizar visitados e capar profundidade para matar ciclos.
- **Modelar estações como pré-requisitos no DAG (GITM):** "craftar picareta" depende de "bancada colocada e ao alcance", que depende de "ter bancada no inventário", que depende de "craftar bancada" (2x2, sem estação). Smelting depende de "fornalha colocada" + "combustível". A estação faz parte do grafo, não é implícita.
- **Pré-flight de ferramenta (`mineflayer-tool` `equipForBlock`) antes de minerar** — confirma que existe ferramenta capaz; senão, o objetivo "minerar X" gera o sub-objetivo "obter ferramenta Y" em vez de cavar a seco.
- **`recipesFor` com e sem `craftingTable`:** se vazio sem estação mas não-vazio com estação → o sub-objetivo é "posicionar bancada", não "impossível".

**Warning signs:**
Objetivo de craft "impossível" quando os materiais existem (faltou passar a estação); recursão estourando pilha; bot mina ferro/diamante e não dropa nada (ferramenta errada → grounding mostra 0); cadeia trava sempre no primeiro item 3x3.

**Phase to address:** **Tech-tree DAG** (depende de Grounding + Crafting). É o objetivo central declarado e o ponto mais provável de precisar pesquisa mais profunda (flag para o roadmap).

---

### Pitfall 5: `placeBlock` falha silenciosa ou trava — referência/face errada, blockUpdate que nunca dispara

**What goes wrong:**
`bot.placeBlock(referenceBlock, faceVector)` é uma das primitivas mais frágeis do Mineflayer e é compartilhada por **abrigo de emergência (reflexo), Building deliberado e posicionar bancada/fornalha**. Falhas documentadas:
1. **`Event blockUpdate did not fire within timeout` (issue #2757):** com lag de servidor, a Promise rejeita por timeout; se não tratada, vira UnhandledPromiseRejection e/ou trava a sequência de construção.
2. **EventEmitter overflow (issue #1585):** listeners de blockUpdate acumulam e podem **derrubar o bot após uso prolongado** — risco direto num bot sempre-ativo construindo muito.
3. **Face/referência errada:** o bloco novo nasce em `referenceBlock.position + faceVector`; passar a face errada coloca o bloco no lugar errado (ou em cima de si mesmo → bot soterra/se prende). Precisa de uma face **exposta** (adjacente a ar) e item equipado na mão.
4. **Sem item na mão** (issue #2320): placement falha silenciosamente se o bloco não está equipado.

**Why it happens:**
Construção é tratada como "calcular posição e chamar placeBlock". Na prática exige: bot posicionado a uma distância de alcance, face exposta correta, item equipado, e tratamento do blockUpdate-timeout. O timeout que não-rejeita-nem-resolve é o mesmo padrão de hang do pathfinder do v1.0.

**How to avoid:**
- **Wrapper de placement com timeout + verificação por estado** (junta Pitfall 1 + watchdog do v1.0): após `placeBlock`, confirmar via `bot.blockAt(pos)` que o bloco do tipo certo está lá; tratar a rejeição de timeout como falha normal alimentada ao planner.
- **Escolher referência+face de forma robusta:** procurar um bloco sólido adjacente à posição-alvo com uma face voltada para ar; nunca colocar onde o próprio bot está (checar bounding box do bot).
- **Equipar o bloco na mão antes** (`bot.equip(item, 'hand')`) e validar que foi equipado.
- **Limpar listeners de blockUpdate** após cada placement (mitiga #1585 no bot sempre-ativo).
- **Posicionar com pathfinder a `GoalPlaceBlock`/`GoalNear`** antes de colocar (e respeitar o pacing anti-cheat do v1.0 — colocar blocos em rajada também é flagável).

**Warning signs:**
`Event blockUpdate did not fire` no log; abrigo com buracos; bot se enterra/prende ao colocar bloco em si mesmo; UnhandledPromiseRejection; vazamento de listeners crescendo ao longo da sessão.

**Phase to address:** **System 1 (abrigo de emergência)** e **Building** compartilham este primitivo — implementar o wrapper de placement uma vez, na primeira feature que precisar de placement (abrigo), e reusar.

---

### Pitfall 6: Custo descontrolado do provider cloud num loop sempre-ativo [INTEGRAÇÃO]

**What goes wrong:**
O usuário escolheu **GPT (cloud)** como provider. Num loop perpétuo (tick a cada poucos segundos × prompt grande de estado-do-mundo+memória × 24/7), chamar o cloud todo tick faz a fatura explodir. Pior: modelos de reasoning cobram **tokens de raciocínio invisíveis** como output — um `reasoning.effort` alto num loop drena custo silenciosamente. E o single-flight do v1.0 protege contra concorrência, mas **não contra frequência** — o bot pode chamar o cloud com frequência perfeitamente serial e ainda assim caro.

**Why it happens:**
A abstração de provider (`ChatOpenAI` só troca baseURL/apiKey) torna trocar local→cloud trivial — e essa facilidade esconde que o local era custo-zero e o cloud não é. O gate de invocação herdado do v1.0 foi pensado para latência/GPU local, não para $.

**How to avoid:**
- **Local (LM Studio) continua o default; cloud é opt-in por env** (já em STACK.md). Não tornar GPT o provider de todo tick.
- **Roteamento por dificuldade:** rotina (rotular intenção de chat, decisões triviais) no local ou em `gpt-4.1-nano`; só decisões de tech-tree/planejamento difícil escalam para o modelo forte.
- **`reasoning.effort: "low"|"minimal"`** como default cloud — corta o maior dreno.
- **Prompt caching:** manter system+persona+schema estáveis no início do prompt (-90% no input cacheado). Mudar a ordem do prompt entre chamadas mata o cache.
- **Gate de invocação reforçado:** não é "single-flight" (concorrência), é "não pense se nada mudou" (frequência) — reusar/endurecer o gate event-driven do v1.0.
- **Teto de gasto/contador de tokens por sessão** com kill-switch (equivalente cloud ao "spend cap" de loop do v1.0).

**Warning signs:**
Fatura OpenAI subindo com o bot parado; contagem de chamadas cloud por minuto alta com estado de jogo estável; tokens de reasoning >> tokens de saída visível; cache hit rate baixo (prompt instável).

**Phase to address:** **Provider LLM** — gate de custo e roteamento por dificuldade entram junto com a abstração cloud, não depois.

---

### Pitfall 7: Divergência de structured-output / tool-calling entre local fraco e GPT

**What goes wrong:**
O mesmo prompt e o mesmo schema produzem comportamento diferente nos dois providers. GPT-5.x honra `strict` JSON Schema nativamente; o modelo local fraco **deriva** (JSON malformado, nomes de ação alucinados, campos inventados — o Pitfall #2 do v1.0). Se o loop foi calibrado e testado contra um provider, **trocar para o outro quebra silenciosamente**: prompts afinados para o local podem ser verbosos/sub-ótimos no GPT; schemas que o GPT aceita podem falhar no parser do local. Além disso há o **caveat zod v4 ↔ `withStructuredOutput`** (issue langchainjs #8357) que pode aceitar no GPT e falhar no caminho local.

**Why it happens:**
A abstração unificada (`ChatOpenAI`) dá a ilusão de que os dois são intercambiáveis. Eles têm a mesma *interface* mas confiabilidade e formato de saída muito diferentes. Testar só com um provider é a armadilha.

**How to avoid:**
- **Validate-repair-fallback continua obrigatório nos DOIS caminhos** (não relaxar a validação porque "o GPT é confiável" — o provider é trocável por env, então o código precisa sobreviver ao pior caso).
- **Constrained decoding no local (GBNF/JSON-schema do LM Studio)** + `strict` no GPT — cada provider usa seu mecanismo de enforcement nativo.
- **Suite de testes que roda contra ambos os providers** (ou um mock de cada perfil de saída) — o critério de aceite do provider é "o loop funciona com local E com cloud".
- **Validar o caveat zod 4** ao vivo nos dois; fallback `zodToJsonSchema` → JSON Schema cru se `withStructuredOutput` falhar.
- **Schemas pequenos e ação single-step** (lição do v1.0) ajudam o local e não prejudicam o GPT.

**Warning signs:**
Loop estável no GPT, quebra ao trocar `LLM_PROVIDER=local` (ou vice-versa); taxa de parse-failure dispara só num provider; schema aceito num caminho, rejeitado no outro; ações alucinadas só com o local.

**Phase to address:** **Provider LLM** — testar a paridade dos dois providers é critério de aceite da abstração.

---

### Pitfall 8: Combate — perder o alvo, morrer mesmo lutando, kiting que vira suicídio

**What goes wrong:**
O estado Fighting (hoje stub) na API nativa (`bot.attack` + pathfinder, sem `mineflayer-pvp` — decisão do STACK) tem armadilhas próprias:
1. **Sem troca/perda de alvo:** o bot fixa um mob, outro o ataca pelas costas e ele morre; ou o alvo morre/despawna e o bot continua "atacando ar" (race de física do v1.0 #9 — alvo stale).
2. **Cooldown de ataque (~0.6s):** spammar `bot.attack` ignora o cooldown de 1.9 do Minecraft → dano reduzido, luta que não progride.
3. **Kiting com pathfinder que trava:** recuar via pathfinder esbarra nos hangs conhecidos (parede/água/knockback freeze #3887) → o bot fica preso enquanto o mob bate.
4. **Lutar quando deveria fugir:** sem regra de "vida crítica → desengajar", o bot morre num combate que não devia ter aceitado.

**Why it happens:**
"Estado de combate" é subestimado como "chamar attack". Sem `mineflayer-pvp` (que dava strafe/cooldown prontos) toda a orquestração é manual — escolha consciente do STACK, mas transfere a complexidade para o loop.

**How to avoid:**
- **Re-validar o alvo antes de cada golpe** (precondição do v1.0 #9): existe? em alcance? ainda hostil? Senão, re-selecionar (`nearestEntity` filtrado por hostil+distância) ou desengajar.
- **Respeitar o cooldown de ataque** (~0.6s entre golpes) — também ajuda no pacing anti-cheat do v1.0.
- **Regra dura de desengajar:** vida < limiar crítico → System 1 preempta o combate e foge/abriga (liga com Pitfall 2). Combate é System 2 deliberado; sobreviver é System 1 reflexo.
- **Kiting com watchdog de movimento** (timeout/no-progress do v1.0) para não travar recuando.
- **Defesa de mob, não PvP** (anti-feature do FEATURES.md) — manter o escopo fechado reduz a superfície.

**Warning signs:**
Bot batendo no ar; morre com comida/vida disponível por não ter desengajado; dano baixo (cooldown ignorado); preso numa parede enquanto recua; ignora um segundo mob.

**Phase to address:** **Combate (P2)** — depois da sobrevivência reflexa provada (FEATURES.md: "hora de atacar e não só fugir").

---

### Pitfall 9: OOM do pathfinder/collectblock reaparece nas novas features [INTEGRAÇÃO]

**What goes wrong:**
O v1.0 teve **OOM ~78GB** com A* do collectBlock e raio alto (fix na Fase 999.1: `searchRadius`/`thinkTimeout`/pré-check `getPathTo`; workaround `PERCEPTION_RADIUS` baixo ainda ativo). As features novas **reintroduzem o mesmo risco por caminhos novos**: building procura referência num raio, combate aproxima/recua com pathfinder repetidamente, smelting/tech-tree busca fornalha/minério num raio, e o curriculum pode pedir "achar diamante" (busca profunda subterrânea). Cada uma pode passar um raio grande ou um goal inalcançável para o A* e estourar memória/bloquear o event loop síncrono — exatamente o que o 999.1 corrigiu só para o dig.

**Why it happens:**
O fix do 999.1 foi **localizado no collectblock**. As primitivas novas (placeBlock+pathfinder, attack+pathfinder, buscar estação) chamam o pathfinder por conta própria sem herdar os bounds. E o `PERCEPTION_RADIUS` baixo (workaround) limita o que o bot *vê*, o que pode fazer a tech-tree não encontrar recursos que existem logo além do raio.

**How to avoid:**
- **Aplicar os bounds do 999.1 a TODA chamada de pathfinder das features novas:** `searchRadius`/`thinkTimeout` e pré-check de viabilidade (`getPathTo`) antes de comprometer com um goal — não só no collectblock.
- **Separar raio de percepção (memória) de raio de busca (pathfinding)** consistentemente (decisão-chave já validada no v1.0) — building/combate/tech-tree usam raio de busca acotado, independente do `PERCEPTION_RADIUS`.
- **Goals inalcançáveis viram falha rápida**, não busca exaustiva (`GoalNear`/`GoalGetToBlock` com range, watchdog do v1.0).
- **Soak-test de memória** com as features novas ativas (o "Always-on overnight" do checklist do v1.0 precisa rodar de novo com building/combate/tech-tree).

**Warning signs:**
RAM subindo durante building/combate/busca de recurso; event loop travado (lag > 200ms, métrica do 999.1) ao procurar fornalha/minério; bot some/trava ao receber objetivo "minerar diamante"; tech-tree não acha recursos que existem (raio de percepção pequeno demais).

**Phase to address:** **Toda fase que adicione uma chamada de pathfinder** (System 1 abrigo, Building, Combate, Tech-tree) — o bound é critério de aceite por feature, não um item único.

---

### Pitfall 10: Fase 4 nunca verificada ao vivo, e o aprendizado por reflexão depende dela [INTEGRAÇÃO]

**What goes wrong:**
A Fase 4 do v1.0 (memória longa/semântica, reflexão, perfis, personalidade) foi marcada concluída **sem verificação humana ao vivo** (Known Gap explícito; `04-07-SUMMARY.md` registra que o teste humano não passou). O v2.0 quer **fechar o loop de aprendizado por reflexão** (mortes/falhas ajustam objetivos futuros) — que **depende inteiramente da Fase 4 funcionar ao vivo**. Construir o aprendizado sobre uma base não-verificada significa que, se a reflexão não dispara ou a recuperação semântica não funciona ao vivo, o "aprendizado" é placebo: o bot parece refletir mas nada influencia decisões.

**Why it happens:**
Débito consciente do v1.0 ("marcada concluída a pedido"). É tentador assumir que "227 testes passando" = funciona ao vivo, mas os testes são unitários/smoke; o gap é justamente runtime real (reflexão disparar, KNN retornar lições relevantes, perfis influenciarem decisão).

**How to avoid:**
- **Live-verify da Fase 4 é pré-requisito do aprendizado**, não paralelo (FEATURES.md já diz isso). Resolver o Known Gap antes ou no início da fase de aprendizado: confirmar ao vivo que `[reflect]` dispara (re-teste limpo pós-B1), que a memória semântica retorna lições relevantes, que perfis persistem e são lidos.
- **Grounding (Pitfall 1) é pré-condição da reflexão útil:** refletir sobre ações alucinadas ("morri" registrado mas não morreu) corrompe o aprendizado. Grounding antes de fechar o loop reflexivo.
- **Provar a influência, não só o registro:** o critério de sucesso é "uma morte por falta de abrigo faz o bot priorizar abrigo na próxima noite" — observável ao vivo, não "a lição foi gravada".
- **Restrição dura:** aprendizado por experiência PRÓPRIA, nunca observar/imitar players (anti-feature do milestone).

**Warning signs:**
`[reflect]` não aparece no log ao vivo (regressão B1); recuperação semântica retorna lições irrelevantes; lições gravadas mas nenhuma decisão muda; reflexão sobre fatos alucinados (sem grounding).

**Phase to address:** **Aprendizado/reflexão (P2)** — com live-verify da Fase 4 como gate de entrada. Depende de Grounding já estar pronto.

---

### Pitfall 11: Sobrevivência — perigos ambientais que matam fora do radar do "mob/fome"

**What goes wrong:**
"Não morrer" é reduzido a comer + fugir de mob, ignorando os assassinos silenciosos: **queda** (pathfinder/exploração leva a um precipício), **lava** (cavar reto para baixo / minerar diamante perto de lava — clássico), **afogamento** (nadar sem rota de saída), **sufocamento** (abrigo de emergência mal feito enterra o bot), **escuridão→spawn em cima do bot**, **knockback para o vazio**. O v1.0 já tem o freeze pós-knockback (#3887). Um "player que não morre" que só pensa em comida ainda morre na primeira caverna.

**Why it happens:**
Sobrevivência é fácil de escopar como "fome + combate" porque são os mais óbvios. Os perigos ambientais são situacionais e exigem percepção espacial (detectar lava/queda à frente) que o LLM lento não dá em tempo — tem que ser reflexo.

**How to avoid:**
- **System 1 inclui guardas ambientais reflexos:** não andar em bloco adjacente a lava sem ponte; nunca cavar reto para baixo; detectar `bot.oxygenLevel` baixo → ir para a superfície; detectar queda iminente (sem bloco à frente-abaixo além de N) → parar.
- **Abrigo de emergência seguro:** o "cavar e tampar" (mc-agents) deve deixar bolsa de ar e não auto-sufocar — validar via `blockAt` ao redor (liga com Pitfall 5).
- **Mineração da tech-tree com regra anti-lava:** ao minerar em profundidade (ferro/diamante), checar blocos adjacentes antes de quebrar (lava/água atrás do alvo).
- **Tratar o freeze pós-knockback (#3887)** no watchdog de movimento.

**Warning signs:**
Mortes por queda/lava/afogamento nos logs de morte; bot cava reto para baixo; abrigo de emergência sufoca o bot; morte em caverna apesar de comida cheia.

**Phase to address:** **System 1 reflexo** (guardas ambientais) + reforço em **Tech-tree** (mineração profunda anti-lava).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Grounding por "Promise resolveu" em vez de delta de inventário | Rápido | Corrompe tech-tree + memória/reflexão (o bug do v1.0 volta) | **Nunca** — é o bug central que o milestone existe para matar |
| Assistente como modo/máquina-de-estados separada | Conceito "limpo" | "Grude no jogador" volta; bot não retorna ao autônomo | **Nunca** — usar objetivo com condição-de-saída |
| Reflexo passando pelo lock do LLM | Reusa o caminho existente | Deadlock/comida tardia; regressão do B1 | **Nunca** — System 1 não chama LLM |
| GPT cloud em todo tick | Reasoning forte sempre | Fatura explode em loop 24/7 | Só em debug pontual; nunca como default de loop |
| Testar o loop só com um provider | Menos trabalho | Quebra silenciosa ao trocar por env | OK num spike; nunca antes de declarar a abstração pronta |
| `placeBlock` sem verificar `blockAt` depois | Menos código | Abrigo com buracos; bot enterrado; #2757 não tratado | **Nunca** em building/abrigo |
| Pathfinder das features novas sem os bounds do 999.1 | Reusa pathfinder direto | OOM ~78GB reaparece por caminho novo | **Nunca** — herdar searchRadius/thinkTimeout |
| Construir aprendizado sobre Fase 4 não verificada ao vivo | Avança rápido | Aprendizado placebo; nada influencia decisão | Nunca sem live-verify primeiro |
| Resolver receitas sem limite de profundidade/memo | Simples | Recursão infinita / stack overflow na tech-tree | **Nunca** |
| `mineflayer-pvp`/`auto-eat` (4 anos parados) em vez de API nativa | Pronto | Bug silencioso vs MC 1.21.4; deps abandonadas | Só se a API nativa provar insuficiente (improvável) |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| System 1 ↔ single-flight do LLM (D-12) | Reflexo espera o lock de inferência | Lock de inferência ≠ lock de atuação; reflexo nunca chama LLM; preempta o corpo físico |
| Modo assistente ↔ socializing/GoalFollow do v1.0 | Seguir jogador como comportamento de fundo coexiste com a hierarquia | Seguir só dentro de objetivo-assistente ativo; remover re-navigate do socializing (fonte do `0b4dc64`) |
| Provider cloud ↔ gate do loop do v1.0 | Gate protege concorrência, não frequência/custo | Roteamento por dificuldade + effort:low + caching + teto de gasto |
| `bot.craft`/`recipesFor` ↔ estação no mundo | Assumir "tenho bancada na mochila" = posso craftar 3x3 | Estação é `Block` colocado e ao alcance; modelar como nó do DAG |
| `bot.placeBlock` ↔ servidor com lag | Awaitar sem tratar `blockUpdate did not fire` (#2757) | Timeout + verificar `blockAt`; limpar listeners (#1585) |
| `bot.openFurnace` ↔ smoker/blast furnace | Usar openFurnace genérico em estações erradas (#1526) | Fornalha normal para minério; tratar `windowOpen` timeout (#3360) |
| pathfinder das features novas ↔ fix do 999.1 | Fix só no collectblock; novas chamadas sem bound | Aplicar searchRadius/thinkTimeout/pré-check a building/combate/tech-tree |
| Aprendizado ↔ Fase 4 (Known Gap) | Assumir "testes passam = funciona ao vivo" | Live-verify (reflect dispara, KNN relevante) antes de fechar o loop |
| zod v4 ↔ `withStructuredOutput` (#8357) | Aceita no GPT, pode falhar no caminho local | Validar nos dois; fallback zodToJsonSchema → JSON Schema cru |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| GPT cloud por tick em loop 24/7 | Fatura subindo com bot parado; reasoning tokens >> output | Local default; roteamento por dificuldade; effort:low; caching | Imediato ao tornar GPT default do loop |
| Pathfinder sem bounds (features novas) | RAM subindo em building/combate/busca; lag >200ms | Bounds do 999.1 em toda chamada; goal inalcançável = falha rápida | Ao adicionar qualquer pathfinder novo com raio alto |
| Listeners de blockUpdate acumulando | Bot derruba após construir muito (#1585) | Limpar listeners por placement | Horas construindo num bot sempre-ativo |
| Resolução de receita sem memo | CPU/pilha estourando ao planejar tech-tree | Memo + limite de profundidade | Ao montar cadeias profundas (ferro/diamante) |
| Mineração profunda sem checagem anti-lava | Mortes recorrentes; perda de inventário | Checar blocos adjacentes antes de quebrar | Ao chegar no tier ferro/diamante (subterrâneo) |

## Security / Safety Mistakes

> Projeto single-player local de pesquisa — riscos clássicos web são mínimos; o risco real é *controle do agente* e, agora, *gasto cloud*.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Sem teto de gasto no provider cloud | Loop runaway gera fatura real (não só "custo" de hardware) | Contador de tokens/sessão + kill-switch; local como default |
| Chat de jogador injetando objetivo-assistente sem limite | Prompt injection: "fica me seguindo pra sempre" / griefing | Tratar chat como dado não-confiável; objetivo-assistente com TTL e escopo fechado |
| Nome de ação alucinado do LLM executado | Comportamento arbitrário (pior no local fraco) | Registry fechado de ações + validação por enum (lição v1.0); nunca eval |
| Endpoint cloud com apiKey em log/commit | Vazamento de credencial paga | apiKey só via env; nunca logar; `.env` no gitignore |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Bot gruda no jogador (regressão) | Quebra o Core Value; o usuário ODEIA isso | Assistente = objetivo com saída; teste de regressão "se afasta sozinho" |
| Bot morre repetidamente (sobrevivência incompleta) | "Não joga como player real" — falha do milestone | System 1 com guardas ambientais, não só fome+mob |
| Assistente atende mas não confirma/relata | Jogador não sabe se o pedido foi feito | Relatar `observed` (grounding) ao concluir, depois voltar ao autônomo |
| Latência cloud em chat | Resposta lenta apesar de modelo forte | Ack rápido + resposta async; chat no modelo barato (nano), planejamento no forte |
| Bot abandona pedido no meio para "viver" | Assistente não confiável | Prioridade dura do objetivo-assistente até concluir/TTL (mas com saída garantida) |

## "Looks Done But Isn't" Checklist

- [ ] **Grounding:** craft/place/mine retornam sucesso — mas o **inventário no jogo** bate com o relatado? Verificar delta de estado, não retorno da Promise.
- [ ] **System 1 reflexo:** come e foge no teste — mas **interrompe** uma ação física em curso (preempção) sem deadlockar o single-flight? Verificar com mob aparecendo durante um craft.
- [ ] **Modo assistente:** atende o pedido — mas **volta sozinho** ao autônomo e se afasta do jogador? Verificar "sem pedido, ele faz suas coisas longe do player".
- [ ] **Tech-tree:** crafta tábua e bancada — mas resolve a cadeia até **ferro** com estações no mundo e ferramenta certa, sem recursão infinita? Verificar cadeia completa ao vivo.
- [ ] **placeBlock/Building:** coloca um bloco — mas o abrigo **fecha de verdade** (sem buracos, sem auto-sufocar) e trata `blockUpdate` timeout? Verificar com servidor sob lag.
- [ ] **Smelting:** abre fornalha — mas **funde minério e retira output** assíncrono sem travar? Verificar ciclo completo putFuel→putInput→takeOutput.
- [ ] **Combate:** ataca o mob — mas **re-seleciona alvo**, respeita cooldown e **desengaja** com vida crítica? Verificar com 2 mobs + vida baixa.
- [ ] **Provider:** funciona no GPT — mas o loop sobrevive ao **trocar para local** por env (parse, schema, custo)? Verificar paridade nos dois.
- [ ] **Sobrevivência ambiental:** não morre de fome — mas sobrevive a **lava/queda/afogamento** numa caverna? Verificar soak em mineração.
- [ ] **Aprendizado:** lição gravada — mas **muda a decisão** futura (morri sem abrigo → priorizo abrigo)? Verificar influência ao vivo + Fase 4 live-verify.
- [ ] **Pathfinder novo:** building/combate navegam — mas **sem OOM** num soak overnight? Re-rodar o soak do v1.0 com as features novas.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Grounding superficial descoberto tarde | MEDIUM-HIGH | Reescrever primitivas para `ActionResult` por delta; auditar memória por fatos falsos já gravados |
| "Grude" voltou | LOW-MEDIUM | Converter modo→objetivo com saída; remover GoalFollow de fundo; adicionar teste de regressão |
| Reflexo deadlockando o single-flight | MEDIUM | Separar lock de inferência vs. atuação; implementar preempção do corpo físico |
| Custo cloud explodiu | LOW | Voltar default para local; effort:low; gate de frequência; teto de gasto |
| OOM do pathfinder em feature nova | LOW | Aplicar bounds do 999.1 à chamada nova (fix conhecido, localizado) |
| placeBlock travando/falhando | LOW | Wrapper timeout + verificação `blockAt`; limpar listeners |
| Recursão de receita infinita | LOW | Adicionar memo + limite de profundidade ao resolvedor |
| Aprendizado placebo (Fase 4 não funciona ao vivo) | MEDIUM-HIGH | Resolver Known Gap da Fase 4 primeiro; provar influência antes de declarar pronto |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Grounding superficial | Grounding (1ª de gameplay) | Inventário no jogo == relatado, em centenas de ações |
| 2. Reflexo vs. single-flight | System 1 reflexo | Mob durante craft → preempção sem deadlock; reflect ainda dispara |
| 3. Regressão "grude no jogador" | Modos autônomo/assistente | Sem pedido → bot se afasta e faz tech-tree; volta ao autônomo após atender |
| 4. Tech-tree / receitas recursivas | Tech-tree DAG | Cadeia até ferro ao vivo, estações no mundo, ferramenta certa, sem recursão |
| 5. placeBlock frágil | System 1 (abrigo) → Building | Abrigo fecha sem buracos/sufoco; `blockUpdate` timeout tratado sob lag |
| 6. Custo cloud em loop | Provider LLM | Fatura estável; local default; roteamento+effort:low+caching verificados |
| 7. Divergência local vs. GPT | Provider LLM | Loop passa com `LLM_PROVIDER=local` E `=openai`; parse-failure ~0 nos dois |
| 8. Combate (alvo/cooldown/fuga) | Combate (P2) | 2 mobs + vida baixa → re-seleciona, respeita cooldown, desengaja |
| 9. OOM pathfinder reaparece | Toda fase com pathfinder novo | Soak overnight com building/combate/tech-tree sem crescer RAM; lag <200ms |
| 10. Fase 4 não verificada ao vivo | Aprendizado/reflexão (P2) | `[reflect]` dispara ao vivo; lição muda decisão futura observável |
| 11. Perigos ambientais | System 1 reflexo | Soak em caverna sem morte por lava/queda/afogamento |

## Sources

- [mineflayer #2757 — `Event blockUpdate did not fire within timeout` ao colocar bloco com lag](https://github.com/PrismarineJS/mineflayer/issues/2757) — HIGH
- [mineflayer #1585 — EventEmitter overflow de listeners de blockUpdate derruba o bot após uso prolongado](https://github.com/PrismarineJS/mineflayer/issues/1585) — HIGH
- [mineflayer #2320 — placeBlock falha sem item na mão](https://github.com/PrismarineJS/mineflayer/issues/2320) — HIGH
- [mineflayer #1526 — openFurnace não funciona com Smokers/Blast Furnaces](https://github.com/PrismarineJS/mineflayer/issues/1526) — HIGH
- [mineflayer #3360 — `Event windowOpen did not fire within timeout` (abrir contêiner/fornalha)](https://github.com/PrismarineJS/mineflayer/issues/3360) — HIGH
- [mineflayer #2186 — Unhandled Promise Rejection em placeBlock](https://github.com/PrismarineJS/mineflayer/issues/2186) — MEDIUM
- [mineflayer #3887 — freeze mid-air após knockback (1.21.x)](https://github.com/PrismarineJS/mineflayer/issues/3887) — HIGH (também citado no v1.0)
- [mineflayer-pathfinder #222 — hang em bloco inquebrável](https://github.com/PrismarineJS/mineflayer-pathfinder/issues/222) — HIGH (base para OOM/hang das chamadas novas)
- [mineflayer docs/api.md — `recipesFor`/`craft`/`placeBlock`/`openFurnace`/`attack`/`consume` (assinaturas e estação como `Block`)](https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md) — HIGH
- [Voyager — arXiv 2305.16291: resolução de tech-tree, self-verification por estado real, error-feedback retry](https://arxiv.org/abs/2305.16291) — HIGH
- [GITM — arXiv 2305.17144: DAG de pré-requisitos Material/Tool (estações como nós)](https://arxiv.org/pdf/2305.17144) — HIGH
- [mc-agents — System 1/System 2, grounding via status.json/events.json, shelter reflexo](https://github.com/jblemee/mc-agents) — HIGH
- [langchainjs #8357 — caveat zod v4 ↔ `withStructuredOutput`/strict](https://github.com/langchain-ai/langchainjs/issues/8357) — MEDIUM
- [OpenAI API docs — `reasoning.effort`, Structured Outputs, prompt caching (controle de custo)](https://developers.openai.com/api/docs/guides/latest-model) — HIGH
- Débitos internos do v1.0 (PROJECT.md Known Gaps + Key Decisions + commits `0b4dc64`/`540966d`): OOM 999.1, single-flight D-12, starvation B1, Fase 4 não-verificada-ao-vivo, re-navigate do socializing — HIGH (fonte primária do projeto)
- `.planning/milestones/v1.0-research/PITFALLS.md` — os 9 pitfalls genéricos que continuam válidos (não repetidos aqui) — HIGH

---
*Pitfalls research for: MineMind v2.0 "Autonomia de Verdade" — adicionar sobrevivência/combate/building/tech-tree/grounding/provider-cloud a um agente Mineflayer+LangGraph existente, com foco em integração com débitos do v1.0*
*Researched: 2026-06-19*
