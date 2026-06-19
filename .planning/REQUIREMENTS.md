# Requirements: MineMind

**Defined:** 2026-06-18
**Core Value:** O agente permanece ativo de forma autônoma, percebe o mundo e age sobre ele com base em objetivos próprios e memória — sem intervenção humana.

## v1 Requirements

Requisitos da versão inicial (MVP de 4 fases do PRD). Cada um mapeia para fases do roadmap.

### Connection (CONN)

- [ ] **CONN-01**: O agente conecta a um servidor Minecraft Java local e permanece online
- [ ] **CONN-02**: O agente reconecta automaticamente após queda/desconexão, criando uma nova sessão de bot limpa
- [ ] **CONN-03**: O estado cognitivo do agente sobrevive a reconexões (não reinicia do zero ao reconectar)

### Perception (PERC)

- [ ] **PERC-01**: O agente lê seu próprio status (vida, fome, posição, hora do dia)
- [ ] **PERC-02**: O agente percebe blocos e entidades próximas, e jogadores por perto
- [ ] **PERC-03**: O agente lê o próprio inventário
- [ ] **PERC-04**: A percepção é exposta como um snapshot imutável do mundo para a camada cognitiva

### Action & Skills (ACT)

- [ ] **ACT-01**: O agente navega autonomamente até uma posição-alvo usando pathfinder
- [ ] **ACT-02**: O agente coleta/minera um tipo de bloco-alvo
- [ ] **ACT-03**: Toda ação física tem timeout e detector de "sem progresso" (não trava o loop)
- [ ] **ACT-04**: As ações são executadas com ritmo humanizado (evita kick por velocidade sobre-humana)
- [ ] **ACT-05**: Skills são expostos tanto como funções quanto como tools (Zod) para o LLM, sem o LLM tocar no mineflayer cru

### Cognition (COG)

- [ ] **COG-01**: O loop cognitivo cíclico funciona (Observe → Analyze → Update Memory → Evaluate Needs → Generate Goals → Plan → Execute → Reflect → repete)
- [ ] **COG-02**: O agente opera por estados cognitivos (Idle, Exploring, Gathering, Socializing; Fighting e Building presentes como stub)
- [ ] **COG-03**: O loop usa arquitetura de duas taxas (camada reativa rápida + deliberação LLM sob gatilho) com chamada LLM single-flight
- [ ] **COG-04**: O loop detecta repetição de ações e progresso, evitando oscilação e travamento

### Communication (CHAT)

- [ ] **CHAT-01**: O agente lê o chat do servidor
- [ ] **CHAT-02**: O agente responde mensagens de jogadores de forma coerente
- [ ] **CHAT-03**: O agente tem uma personalidade base (prompt estático) que dá voz consistente às respostas

### LLM Integration (LLM)

- [ ] **LLM-01**: O agente raciocina e planeja usando um LLM local via LM Studio (endpoint OpenAI-compatível)
- [ ] **LLM-02**: A saída do LLM é validada/restringida (enum de ações fechado + schema Zod + repair/fallback) para tolerar modelos locais
- [ ] **LLM-03**: O cliente LLM é abstraído por provedor (permite trocar para nuvem depois sem reescrever a cognição)

### Needs (NEED)

- [ ] **NEED-01**: O agente possui necessidades internas (sobrevivência, recursos, abrigo, curiosidade, socialização) que decaem/variam com o tempo
- [ ] **NEED-02**: As necessidades influenciam a seleção de estado e a priorização de objetivos, com anti-starvation (necessidade ignorada cresce em prioridade)

### Goals (GOAL)

- [ ] **GOAL-01**: O agente gera objetivos dinâmicos com prioridade, progresso e dependências
- [ ] **GOAL-02**: O agente mantém comprometimento/histerese com um objetivo (não troca de alvo a cada tick) e respeita um orçamento de replanejamento

### Memory (MEM)

- [ ] **MEM-01**: O agente mantém memória de curto prazo (buffer limitado de eventos/conversas/ações recentes) com orçamento de tokens
- [x] **MEM-02**: O agente persiste memória de longo prazo (jogadores, locais, eventos) que sobrevive a reinícios
- [x] **MEM-03**: O agente recupera memórias semânticas relevantes por similaridade (recência × relevância × importância)

### Reflection (REFL)

- [x] **REFL-01**: No estado Reflecting, o agente revisa acontecimentos, consolida memória e atualiza objetivos

### Social (SOC)

- [x] **SOC-01**: O agente mantém um perfil por jogador (nome, frequência de interação, histórico, grau de confiança)
- [x] **SOC-02**: O agente tem uma personalidade que evolui a partir de uma linha de base (sem aprendizado adaptativo avançado)

## v2 Requirements

Adiado para versão futura. Rastreado, mas fora do roadmap atual.

### Advanced Cognition

- **ADV-01**: Personalidade adaptativa avançada e aprendizado contínuo
- **ADV-02**: Aquisição de skills estilo Voyager (biblioteca de habilidades aprendidas)
- **ADV-03**: Reflexão avançada com síntese de crenças de longo prazo

### LLM Providers

- **PROV-01**: Provedores de LLM em nuvem (Claude, GPT, Gemini, etc.) via a abstração de provedor
- **PROV-02**: Visualizador (`prismarine-viewer`) como ferramenta de debug opt-in

## Out of Scope

Excluído explicitamente. Documentado para evitar scope creep.

| Feature | Reason |
|---------|--------|
| Minecraft Bedrock Edition | Mineflayer suporta apenas Java Edition |
| Código executável gerado pelo LLM | Risco de segurança/depuração; conflita com o objetivo de design limpo/instrutivo |
| Módulos cognitivos concorrentes/paralelos | Problema de coerência (PIANO "diz uma coisa, faz outra"); um loop sequencial é a simplificação certa |
| Sociedade multi-agente | Fora do escopo de um único agente "vivo" |
| Combate e construção como foco de v1 | Presentes apenas como stub para completar a máquina de estados; alta superfície de falha |
| Servidores públicos/multiplayer reais em v1 | Desenvolvimento em servidor Java local para controle e testes |

## Traceability

Quais fases cobrem quais requisitos. Preenchido durante a criação do roadmap.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | Phase 1 | Pending |
| CONN-02 | Phase 1 | Pending |
| PERC-01 | Phase 1 | Pending |
| PERC-02 | Phase 1 | Pending |
| PERC-03 | Phase 1 | Pending |
| PERC-04 | Phase 1 | Pending |
| ACT-01 | Phase 1 | Pending |
| ACT-02 | Phase 1 | Pending |
| ACT-03 | Phase 1 | Pending |
| ACT-04 | Phase 1 | Pending |
| ACT-05 | Phase 1 | Pending |
| COG-01 | Phase 2 | Pending |
| COG-02 | Phase 2 | Pending |
| COG-04 | Phase 2 | Pending |
| MEM-01 | Phase 2 | Pending |
| COG-03 | Phase 3 | Pending |
| CHAT-01 | Phase 3 | Pending |
| CHAT-02 | Phase 3 | Pending |
| CHAT-03 | Phase 3 | Pending |
| LLM-01 | Phase 3 | Pending |
| LLM-02 | Phase 3 | Pending |
| LLM-03 | Phase 3 | Pending |
| NEED-01 | Phase 3 | Pending |
| NEED-02 | Phase 3 | Pending |
| GOAL-01 | Phase 3 | Pending |
| GOAL-02 | Phase 3 | Pending |
| CONN-03 | Phase 3 | Pending |
| MEM-02 | Phase 4 | Complete |
| MEM-03 | Phase 4 | Complete |
| REFL-01 | Phase 4 | Complete |
| SOC-01 | Phase 4 | Complete |
| SOC-02 | Phase 4 | Complete |

**Coverage:**
- v1 requirements: 32 total (contagem real dos IDs; a nota anterior de "28" estava desatualizada)
- Mapped to phases: 32 ✓
- Unmapped: 0

---
*Requirements defined: 2026-06-18*
*Last updated: 2026-06-18 after roadmap creation*
