# ZZZ 驱动盘培养 Agent — TypeScript 完整设计方案

---

## 一、项目背景

### 游戏背景：《绝区零》驱动盘系统

《绝区零》（Zenless Zone Zero，ZZZ）是米哈游出品的动作 RPG。驱动盘是角色核心强化装备，机制如下：

- 每个角色装配 6 个部位（[1]~[6]号位），每个部位只能装对应槽位的盘
- 每块盘有 1 条主词条 + 最多 4 条副词条
- 凑齐同套装 4 件或 2 件可激活套装效果
- 副词条每升 +3 级随机强化一条，满级为 +15
- 资源稀缺，升级过的盘拆解损耗大，必须精准培养

套装搭配逻辑：

- 4+2（主流毕业）：4 件套激活强效果 + 2 件套辅助
- 2+2+2（过渡）：三个 2 件套，灵活但效果弱

各号位主词条规则：

- [1]号位：固定生命值（数值）
- [2]号位：固定攻击力（数值）
- [3]号位：固定防御力（数值）
- [4]号位：随机 暴击率 / 暴击伤害
- [5]号位：随机 生命%/攻击%/防御%/穿透率/各属性伤害加成
- [6]号位：随机 生命%/攻击%/防御%/冲击力/异常掌控/能量自动回复

反作弊风险：游戏使用 HYP/ACE 反作弊，自动鼠标操作存在封号风险。项目默认「建议模式」（人工确认），「自动执行模式」由用户自行开启。

---

## 二、项目目标

1. 自动扫描导入：识别背包中所有驱动盘，存入本地数据库
2. 智能评分：根据预设角色配置，评估每块盘对各角色的适用分
3. 全局最优分配：解决多角色的驱动盘最优分配问题
4. 动态升级培养：每升 +3 观察副词条，实时决策继续/保留/废弃
5. 数据库同步：升级结果实时写回数据库，分配方案动态调整

---

## 三、技术栈

| 职责            | 新方案 (TypeScript)                            |
| --------------- | ---------------------------------------------- |
| 运行时 + 包管理 | **Bun**（运行时 + 包管理二合一）               |
| 语言            | **TypeScript (strict mode)**                   |
| LLM SDK         | **`@anthropic-ai/sdk`**                        |
| 视觉识别        | Claude Vision API（截图 base64 发给 Claude）   |
| 屏幕截图        | **`screenshot-desktop`** + **`sharp`**（裁剪） |
| 鼠标模拟        | **`@nut-tree/nut-js`**                         |
| 图像处理        | **`sharp`**                                    |
| 数据库          | **`better-sqlite3`**（同步 API）               |
| 数据验证        | **`zod`**                                      |
| 知识库          | Markdown Skills（SKILL.md 格式）               |

安装命令：

```bash
bun add @anthropic-ai/sdk better-sqlite3 zod sharp screenshot-desktop @nut-tree/nut-js
bun add -d @types/better-sqlite3 bun-types typescript
```

平台支持：macOS 优先，Windows 兼容。所有依赖均跨平台。macOS 需授权辅助功能权限（鼠标模拟）。

---

## 四、Agent 架构设计

采用 Plan-and-Execute（主协调）+ ReAct（子任务执行）+ Reflection（迭代优化）混合架构：

```text
玩家自然语言指令
        ↓
┌────────────────────────────────────────┐
│        Orchestrator Agent              │
│        Plan-and-Execute 主协调者       │
│                                        │
│  1. 解析玩家意图 + 提取目标角色        │
│  2. recommend_team() ← 配队感知        │
│  3. 用户确认配队                       │
│  4. SkillLoader 加载知识上下文         │
│  5. 分解为有序任务步骤                 │
│  6. 调度子 Agent（均携带 team 参数）   │
│  7. 汇总结果反馈玩家                   │
└──┬──────────┬──────────┬──────────┬────┘
   │          │          │          │
   ▼          ▼          ▼          ▼
Scanner   Evaluator  Optimizer  Upgrade
Agent     Agent      Agent      Agent
(ReAct)   (ReAct     (Plan+     (ReAct+
          +Tools)    Reflect)   Reflect)
              │
              ├── LocalScorer（本地快速评分，从 Skills 提取权重）
              └── Claude（精细评分，注入完整 Skill 上下文）
   │          │          │          │
   └──────────┴──────────┴──────────┘
                  │
         ┌───────┴────────┐
         │ SQLite Database │
         │                 │
         │ drive_discs     │
         │ sub_stats       │
         │ score_matrix    │
         │ upgrade_logs    │
         │ assignments     │
         └───────┬────────┘
                 │
   ┌─────────────┴─────────────────┐
   │  knowledge/ (Skills 知识库)   │
   │  ├── meta/disc-system/        │  ← 驱动盘系统通用规则
   │  ├── characters/角色名/       │  ← 角色基础培养标准
   │  ├── teams/配队名/            │  ← 配队微调规则
   │  └── scoring/                 │  ← 评分公式 + 满级参考值
   │                               │
   │  SkillLoader 统一加载         │
   │  → system prompt 注入         │
   │    （带 Prompt Caching）      │
   │  → LocalScorer 权重提取       │
   └───────────────────────────────┘
```

---

## 五、目录结构

```text
zzz-disc-agent/
├── src/
│   ├── index.ts                       # 主入口，启动 Orchestrator
│   ├── config.ts                      # 全局配置（分辨率、截图区域、模式开关）
│   │
│   ├── knowledge/                     # 知识库加载与评分
│   │   ├── skill-loader.ts            # SkillLoader 类
│   │   └── local-scorer.ts            # LocalScorer 类
│   │
│   ├── database/                      # 数据库层
│   │   ├── schema.sql                 # 建表 SQL
│   │   ├── db.ts                      # Database 类（所有 CRUD 操作）
│   │   └── models.ts                  # Zod schema + 类型导出
│   │
│   ├── capture/                       # 屏幕捕获层
│   │   ├── screen-capture.ts          # 截图、裁剪、base64 转换
│   │   ├── region-detector.ts         # 检测游戏 UI 区域坐标
│   │   └── ui-navigator.ts            # 游戏 UI 导航（打开背包、翻页、选中驱动盘等）
│   │
│   ├── agents/                        # Agent 层
│   │   ├── base-agent.ts              # BaseAgent 基类（Claude 调用、SkillLoader 注入、Prompt Caching）
│   │   ├── orchestrator.ts            # OrchestratorAgent（Plan-and-Execute + 配队感知）
│   │   ├── scanner-agent.ts           # ScannerAgent（ReAct，扫描导入）
│   │   ├── evaluator-agent.ts         # EvaluatorAgent（ReAct + Tool Use，评分）
│   │   ├── optimizer-agent.ts         # OptimizerAgent（Plan + Reflect，分配优化）
│   │   └── upgrade-agent.ts           # UpgradeAgent（ReAct + Reflect，升级决策）
│   │
│   ├── action/                        # 执行层
│   │   └── executor.ts                # ActionExecutor（鼠标模拟，带确认模式）
│   │
│   └── utils/
│       ├── logger.ts                  # 统一日志
│       └── image-utils.ts             # 图像预处理工具
│
├── knowledge/                         # 游戏知识库（Skills 格式，玩家可直接编辑）
│   ├── meta/
│   │   └── disc-system/
│   │       └── SKILL.md               # 驱动盘系统通用规则（槽位、升级机制）
│   │
│   ├── characters/                    # 角色基础培养标准（每个角色一个目录）
│   │   ├── 艾莲/
│   │   │   ├── SKILL.md               # 基础盘配置（默认最优方案）
│   │   │   └── references/            # 可选：深度分析
│   │   │       └── matchups.md
│   │   ├── 朱鸢/
│   │   │   └── SKILL.md
│   │   └── 苍角/
│   │       └── SKILL.md
│   │
│   ├── teams/                         # 配队微调规则（每个配队一个目录）
│   │   ├── 艾莲冰队/
│   │   │   └── SKILL.md               # 艾莲+莱卡恩+苍角 配队下的盘配置差异
│   │   └── 朱鸢火队/
│   │       └── SKILL.md
│   │
│   └── scoring/
│       └── SKILL.md                   # 评分规则 + 副词条满级参考值
│
├── package.json
├── tsconfig.json
├── .env                               # ANTHROPIC_API_KEY（不提交到 git）
└── bun.lock
```

---

## 六、数据库 Schema

```sql
-- src/database/schema.sql

PRAGMA foreign_keys = ON;

-- 驱动盘主表
CREATE TABLE IF NOT EXISTS drive_discs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 6),
  set_name TEXT NOT NULL,
  rarity INTEGER NOT NULL CHECK(rarity BETWEEN 1 AND 3),
  level INTEGER NOT NULL DEFAULT 0 CHECK(level BETWEEN 0 AND 15),
  main_stat TEXT NOT NULL,
  main_value REAL NOT NULL,
  -- 状态: unreviewed/keep/discard/equipped
  status TEXT NOT NULL DEFAULT 'unreviewed',
  is_equipped INTEGER NOT NULL DEFAULT 0,
  equipped_to TEXT, -- 角色名
  fingerprint TEXT UNIQUE, -- 去重指纹（set+slot+main+subs hash）
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 副词条表（每块盘最多4条）
CREATE TABLE IF NOT EXISTS sub_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  disc_id INTEGER NOT NULL REFERENCES drive_discs(id) ON DELETE CASCADE,
  stat_type TEXT NOT NULL,
  value REAL NOT NULL,
  upgrade_count INTEGER NOT NULL DEFAULT 0 -- 该条被强化次数
);

-- 各角色对每块盘的评分缓存
CREATE TABLE IF NOT EXISTS score_matrix (
  disc_id INTEGER NOT NULL REFERENCES drive_discs(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  team_name TEXT, -- 配队上下文（可为空表示基础评分）
  score REAL NOT NULL,
  scored_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (disc_id, character_name, team_name)
);

-- 升级日志
CREATE TABLE IF NOT EXISTS upgrade_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  disc_id INTEGER NOT NULL REFERENCES drive_discs(id),
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  new_sub TEXT, -- 新增副词条 JSON（如有）
  enhanced_sub TEXT, -- 被强化的副词条 JSON（如有）
  decision TEXT, -- 本轮决策：continue/keep/discard
  timestamp TEXT DEFAULT (datetime('now'))
);

-- 分配方案快照
CREATE TABLE IF NOT EXISTS assignment_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_name TEXT, -- 配队名称
  plan TEXT NOT NULL, -- JSON {角色: {slot: disc_id}}
  total_score REAL,
  is_active INTEGER DEFAULT 0, -- 当前生效的方案
  created_at TEXT DEFAULT (datetime('now'))
);

-- 触发器：更新 updated_at
CREATE TRIGGER IF NOT EXISTS update_disc_timestamp
AFTER UPDATE ON drive_discs
BEGIN
  UPDATE drive_discs SET updated_at = datetime('now') WHERE id = NEW.id;
END;
```

注意：角色配置完全由 `knowledge/characters/*/SKILL.md` 提供，不在数据库中存储。

---

## 七、数据模型（Zod）

```typescript
// src/database/models.ts

import { z } from "zod";
import { createHash } from "crypto";

// ---- 枚举 ----

export const StatType = z.enum([
  "生命值",
  "生命值%",
  "攻击力",
  "攻击力%",
  "防御力",
  "防御力%",
  "暴击率",
  "暴击伤害",
  "穿透率",
  "异常精通",
  "异常掌控",
  "冲击力",
  "能量自动回复",
  "火属性伤害加成",
  "冰属性伤害加成",
  "电属性伤害加成",
  "物理伤害加成",
  "以太属性伤害加成",
]);
export type StatType = z.infer<typeof StatType>;

export const DiscStatus = z.enum(["unreviewed", "keep", "discard", "equipped"]);
export type DiscStatus = z.infer<typeof DiscStatus>;

// ---- 数据结构 ----

export const SubStatSchema = z.object({
  statType: StatType,
  value: z.number(),
  upgradeCount: z.number().int().default(0),
});
export type SubStat = z.infer<typeof SubStatSchema>;

export const DriveDiscSchema = z.object({
  id: z.number().int().optional(),
  slot: z.number().int().min(1).max(6),
  setName: z.string(),
  rarity: z.number().int().min(1).max(3),
  level: z.number().int().min(0).max(15).default(0),
  mainStat: StatType,
  mainValue: z.number(),
  subStats: z.array(SubStatSchema).default([]),
  status: DiscStatus.default("unreviewed"),
  isEquipped: z.boolean().default(false),
  equippedTo: z.string().nullable().default(null),
});
export type DriveDisc = z.infer<typeof DriveDiscSchema>;

export const DecisionSchema = z.object({
  action: z.string(),
  targetCharacter: z.string().nullable().default(null),
  score: z.number(),
  reason: z.string(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const AssignmentPlanSchema = z.object({
  plan: z.record(z.string(), z.record(z.string(), z.number().int())),
  totalScore: z.number(),
  reasoning: z.string(),
});
export type AssignmentPlan = z.infer<typeof AssignmentPlanSchema>;

// ---- 工具函数 ----

export function fingerprint(disc: DriveDisc): string {
  const subs = disc.subStats
    .map((s) => `${s.statType}${s.value}`)
    .sort()
    .join("|");
  const data = `${disc.slot}|${disc.setName}|${disc.mainStat}|${subs}`;
  return createHash("md5").update(data).digest("hex").slice(0, 12);
}
```

---

## 八、知识库（Skills 格式）

知识库采用 SKILL.md 格式。每个 SKILL.md 文件：

- 开发时：被 Claude Code 的 Skill 系统自动加载，辅助写代码
- 运行时：被 SkillLoader 读取，注入 Claude API 的 system prompt

### 8.1 标记约定

用 HTML 注释标记包裹结构化数据，供运行时提取：

| 标记                              | 用途                 | 位置             |
| --------------------------------- | -------------------- | ---------------- |
| `<!-- scoring-weights -->`        | 副词条权重表         | 角色 SKILL.md    |
| `<!-- team-overrides: 角色名 -->` | 配队覆盖值           | 配队 SKILL.md    |
| `<!-- team-config: 角色名 -->`    | 配队中角色的完整配置 | 配队 SKILL.md    |
| `<!-- scoring-formula -->`        | 评分公式参数         | scoring/SKILL.md |
| `<!-- max-values -->`             | 副词条满级最大值     | scoring/SKILL.md |

### 8.2 角色 Skill 示例：knowledge/characters/艾莲/SKILL.md

角色 Skill 使用 Markdown 表格存储结构化数据，自然语言存储策略知识。
玩家直接编辑 SKILL.md 文件来配置角色培养目标。

```markdown
---
name: 艾莲
description: 当用户提到"艾莲"、"艾莲配盘"、"艾莲驱动盘"时使用此 skill。包含艾莲的驱动盘基础培养标准。
---

# 艾莲 — 驱动盘培养标准

## 基础信息

- 定位：强攻（主C）
- 属性：冰
- 培养优先级：S

## 套装搭配

### 毕业方案（4+2）

| 主套装（4件） | 副套装（2件） | 说明                                                 |
| ------------- | ------------- | ---------------------------------------------------- |
| 极地重金属    | 混沌爵士      | 最优毕业。冰套4件提供冰伤加成，攻击套2件提升基础输出 |
| 极地重金属    | 自由蓝调      | 次选。暴击套2件适合暴击率不足的情况                  |

### 过渡方案（2+2+2）

极地重金属2 + 混沌爵士2 + 自由蓝调2，凑不到4件时临时使用。

## 各槽位主词条

| 槽位 | 最优           | 次选     | 说明                          |
| ---- | -------------- | -------- | ----------------------------- |
| 4    | 暴击率         | 暴击伤害 | 基础暴率仅5%，暴击率优先      |
| 5    | 冰属性伤害加成 | 攻击力%  | 冰伤为最优增伤途径            |
| 6    | 攻击力%        | —        | 攻击%为主，双暴不足时考虑暴伤 |

## 副词条权重

<!-- scoring-weights -->

| 副词条   | 权重 | 说明               |
| -------- | ---- | ------------------ |
| 暴击率   | 10   | 核心词条           |
| 暴击伤害 | 9    | 核心词条           |
| 攻击力%  | 8    | 高价值             |
| 穿透率   | 6    | 中价值             |
| 攻击力   | 4    | 小词条有用但不优先 |
| 生命值%  | 1    | 无用               |
| 防御力%  | 1    | 无用               |

<!-- /scoring-weights -->

## 毕业面板目标

- 暴击率：≥70%
- 暴击伤害：≥120%

## 培养决策要点

- 4号位必须暴击率主词条，暴击伤害只在暴击率已溢出时考虑
- 副词条双暴是底线，三条有效词条（双暴+攻击%或穿透）才值得拉满
- +9 时如果 0 条双暴直接废弃，不要心存侥幸
```

### 8.3 配队 Skill 示例：knowledge/teams/艾莲冰队/SKILL.md

配队 Skill 定义特定队伍中各角色驱动盘配置与基础配置的差异。
运行时加载顺序：角色基础 Skill → 配队 Skill 覆盖。

```markdown
---
name: 艾莲冰队
description: 当用户使用"艾莲+莱卡恩+苍角"配队，或提到"艾莲冰队"时使用此 skill。包含该配队下三个角色的驱动盘微调规则。
---

# 艾莲冰队 — 艾莲 / 莱卡恩 / 苍角

## 配队逻辑

- 艾莲：主C，负责冰属性输出
- 莱卡恩：副C/辅助，提供暴击率团队 buff（被动：队伍暴击率+10%）
- 苍角：击破辅助，提供以太伤害削抗

## 与基础配置的差异

### 艾莲（本队微调）

莱卡恩提供 +10% 暴击率 buff，因此：

<!-- team-overrides: 艾莲 -->

| 调整项          | 基础值 | 本队值                    | 原因                                   |
| --------------- | ------ | ------------------------- | -------------------------------------- |
| 暴击率权重      | 10     | 7                         | 莱卡恩 buff 降低了暴击率的边际收益     |
| 暴击伤害权重    | 9      | 10                        | 暴击率有 buff 补充，暴伤成为更高优先级 |
| 4号位主词条首选 | 暴击率 | 暴击率或暴击伤害均可      | 暴击率可能溢出                         |
| 毕业暴击率目标  | ≥70%   | ≥60%（面板，buff 后 70%） | buff 补了10%                           |

<!-- /team-overrides: 艾莲 -->

### 莱卡恩（本队配置）

<!-- team-config: 莱卡恩 -->

- 定位：副C/辅助
- 套装：自由蓝调4 + 混沌爵士2
- 4号位：暴击率
- 5号位：冰属性伤害加成
- 6号位：攻击力%
- 副词条权重：暴击率10 / 暴击伤害9 / 攻击力%8 / 穿透率5
<!-- /team-config: 莱卡恩 -->

### 苍角（本队配置）

<!-- team-config: 苍角 -->

- 定位：击破辅助
- 套装：极致冲击4 + 混沌爵士2
- 4号位：暴击率
- 5号位：以太属性伤害加成
- 6号位：异常掌控
- 副词条权重：冲击力10 / 异常掌控9 / 攻击力%7 / 暴击率6
<!-- /team-config: 苍角 -->

## 盘分配优先级

本队中盘的分配冲突时：艾莲(S) > 莱卡恩(A) > 苍角(A)
苍角的击破套和艾莲/莱卡恩无套装冲突，通常不会抢盘。
```

### 8.4 评分规则 Skill：knowledge/scoring/SKILL.md

```markdown
---
name: 驱动盘评分规则
description: 当需要评分驱动盘、计算分数、判断盘的价值时使用此 skill。
---

# 驱动盘评分规则

## 分值结构（满分 100+5）

<!-- scoring-formula -->

| 评分维度 | 满分  | 说明                         |
| -------- | ----- | ---------------------------- |
| 套装匹配 | 25+10 | 4件套命中25分，2件套命中10分 |
| 主词条   | 30    | 最优30分，次优15分，错误0分  |
| 副词条   | 45    | 按权重加权归一化             |
| 等级加成 | 5     | +15=5, +12=3, +9=1, 其他=0   |

<!-- /scoring-formula -->

## 副词条评分公式

副词条分 = (Σ 每条副词条得分) / 理论最大分 × 45

单条副词条得分 = (实际值 / 满级最大值) × 该词条权重

## 副词条满级参考最大值

<!-- max-values -->

| 副词条       | 满级最大值 |
| ------------ | ---------- |
| 暴击率       | 24.0       |
| 暴击伤害     | 48.0       |
| 攻击力%      | 30.0       |
| 攻击力       | 200        |
| 生命值%      | 30.0       |
| 生命值       | 2200       |
| 防御力%      | 37.5       |
| 防御力       | 115        |
| 穿透率       | 24.0       |
| 异常精通     | 92.0       |
| 异常掌控     | 92.0       |
| 冲击力       | 18.0       |
| 能量自动回复 | 20.0       |

<!-- /max-values -->

## 本地快速过滤阈值

- score < 20：自动标记废弃候选，不调用 Claude
- score 20~50：Claude 评估是否有潜力
- score > 50：高价值盘，Claude 精细分析最佳归属
```

---

## 九、各模块详细规格

### 9.1 SkillLoader（知识加载）

职责：统一加载 SKILL.md 文件，拼接知识上下文，提取结构化数据供本地评分使用。

关键设计：

- 读取 SKILL.md 时去掉 YAML frontmatter，返回纯 Markdown 正文
- 按层级拼接：meta → scoring → characters → teams
- 配队 Skill 加载时标注"优先级高于基础配置"
- 通过 HTML 注释标记提取权重数据（正则解析）

```typescript
// src/knowledge/skill-loader.ts

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, resolve } from "path";

export class SkillLoader {
  private knowledgeDir: string;

  constructor(knowledgeDir = "knowledge") {
    this.knowledgeDir = resolve(knowledgeDir);
  }

  /** 读取一个 SKILL.md，去掉 frontmatter 返回正文 */
  loadSkill(...pathParts: string[]): string | null { ... }

  /** 拼接完整知识上下文，用于注入 system prompt */
  loadContext(characters: string[], team?: string): string { ... }

  /** 列出所有可用配队 */
  listTeams(): string[] { ... }

  /** 列出所有可用角色 */
  listCharacters(): string[] { ... }

  /** 查找包含指定角色的配队 */
  findTeamsForCharacter(character: string): string[] { ... }

  /** 提取副词条权重，配队覆盖基础值 */
  extractWeights(character: string, team?: string): Record<string, number> { ... }

  /** 从 scoring/SKILL.md 提取副词条满级最大值 */
  extractMaxValues(): Record<string, number> { ... }

  /** 从 scoring/SKILL.md 提取评分公式参数 */
  extractScoringFormula(): Record<string, number> { ... }
}
```

加载优先级与拼接顺序：

```text
meta/disc-system/SKILL.md        # 总是加载
scoring/SKILL.md                  # 总是加载
characters/{角色}/SKILL.md        # 按目标角色加载
teams/{配队}/SKILL.md             # 如有配队则加载，标注覆盖优先级
```

配队 Skill 注入时添加前缀提示：

> ⚠️ 以下配队微调规则优先级高于角色基础配置，遇到冲突时以配队规则为准

### 9.2 LocalScorer（本地快速评分）

职责：纯本地计算评分，不调用 LLM，用于快速过滤低价值盘。

```typescript
// src/knowledge/local-scorer.ts

import type { DriveDisc } from "../database/models";
import { SkillLoader } from "./skill-loader";

export class LocalScorer {
  private skills: SkillLoader;

  constructor(skills: SkillLoader) {
    this.skills = skills;
  }

  /** 计算单块盘对某角色的得分 */
  score(disc: DriveDisc, character: string, team?: string): number { ... }

  /** 套装匹配分（0/10/25） */
  private scoreSet(disc: DriveDisc, character: string, team?: string): number { ... }

  /** 主词条分（0/15/30） */
  private scoreMainStat(disc: DriveDisc, character: string, team?: string): number { ... }

  /** 副词条分（0~45），按权重加权归一化 */
  private scoreSubStats(disc: DriveDisc, weights: Record<string, number>, maxValues: Record<string, number>): number { ... }

  /** 等级加成分（0/1/3/5） */
  private scoreLevel(level: number): number { ... }
}
```

评分流程：

```text
SkillLoader.extractWeights(character, team)
  → 基础权重 + 配队覆盖
  → LocalScorer.score(disc, weights)
  → score < 20: 废弃候选，跳过 LLM
  → score >= 20: 送 Claude 精细评分（附带完整 Skill 上下文）
```

### 9.3 BaseAgent（基类）

职责：统一管理 Claude API 调用、Skills 知识注入、Prompt Caching。

关键设计：

- 使用 SkillLoader 加载知识
- 知识文本使用 `cache_control: ephemeral` 标记，被 Claude 缓存
- 后续对话复用缓存，节省约 90% 输入 token 费用
- 所有 Agent 继承此类，避免重复初始化
- `buildSystem` 接受 characters 和 team 参数，按需加载对应 Skills

````typescript
// src/agents/base-agent.ts

import Anthropic from "@anthropic-ai/sdk";
import { SkillLoader } from "../knowledge/skill-loader";

export class BaseAgent {
  protected client: Anthropic;
  protected skills: SkillLoader;

  constructor() {
    this.client = new Anthropic(); // 自动读取 ANTHROPIC_API_KEY
    this.skills = new SkillLoader();
  }

  protected buildSystem(
    characters?: string[],
    team?: string,
    extraContext?: string,
  ): Anthropic.MessageCreateParams["system"] {
    const knowledge = this.skills.loadContext(characters ?? [], team);
    return [
      {
        type: "text" as const,
        text: knowledge,
        cache_control: { type: "ephemeral" as const }, // Prompt Cache
      },
      {
        type: "text" as const,
        text: extraContext || "你是《绝区零》驱动盘培养专家助手。",
      },
    ];
  }

  protected async call(opts: {
    userMessage: string;
    tools?: Anthropic.Tool[];
    characters?: string[];
    team?: string;
    extraContext?: string;
    maxTokens?: number;
    useThinking?: boolean;
  }): Promise<Anthropic.Message> {
    const params: Anthropic.MessageCreateParams = {
      model: "claude-opus-4-6",
      max_tokens: opts.maxTokens ?? 2048,
      system: this.buildSystem(opts.characters, opts.team, opts.extraContext),
      messages: [{ role: "user", content: opts.userMessage }],
    };
    if (opts.useThinking !== false) {
      params.thinking = { type: "adaptive" };
    }
    if (opts.tools) {
      params.tools = opts.tools;
    }
    return this.client.messages.create(params);
  }

  protected async callStream(opts: {
    userMessage: string;
    characters?: string[];
    team?: string;
    extraContext?: string;
    maxTokens?: number;
  }): Promise<Anthropic.Message> {
    const stream = this.client.messages.stream({
      model: "claude-opus-4-6",
      max_tokens: opts.maxTokens ?? 4096,
      thinking: { type: "adaptive" },
      system: this.buildSystem(opts.characters, opts.team, opts.extraContext),
      messages: [{ role: "user", content: opts.userMessage }],
    });
    return stream.finalMessage();
  }

  protected extractText(response: Anthropic.Message): string {
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("No text block found");
    return block.text;
  }

  protected extractJson(response: Anthropic.Message): unknown {
    let text = this.extractText(response);
    if (text.includes("```json")) {
      text = text.split("```json")[1].split("```")[0];
    } else if (text.includes("```")) {
      text = text.split("```")[1].split("```")[0];
    }
    return JSON.parse(text.trim());
  }
}
````

### 9.4 ScannerAgent（扫描导入）

模式：ReAct（循环截图→识别→翻页→直到结束）

工具调用流程：

- 调用 UINavigator.openDiscInventory() 打开背包
- 调用 ScreenCapture.captureFullScreen() 截全屏
- 将截图 base64 传给 Claude Vision 识别当前页所有盘
- 调用 UINavigator.goNextPage() 翻页，返回 false 时停止
- 每块盘计算 fingerprint 去重，新盘才写入数据库

Claude 识别 Prompt 要点：

```text
这是《绝区零》驱动盘背包页面截图。
请识别页面中所有可见的驱动盘，每块盘提取：

- slot（槽位编号1-6）
- setName（套装名称）
- rarity（稀有度，S级=3，A级=2，B级=1）
- level（当前强化等级0-15）
- mainStat（主词条属性名，使用中文全称）
- mainValue（主词条数值，不含%符号）
- subStats（副词条列表，每条含 statType 和 value）

输出纯 JSON 数组，无其他文字。
```

驱动盘装备状态识别补充 Prompt：

```text
如果该驱动盘右上角有角色头像或"已装备"标记，
请在对应盘的数据中加入 "isEquipped": true, "equippedTo": "角色名"。
```

### 9.5 EvaluatorAgent（评分）

模式：ReAct + Tool Use（主动查询角色配置工具）

两阶段评分策略：

1. 本地快速评分（LocalScorer.score()，无 LLM）：过滤明显不符合的盘（得分<20直接标记废弃候选），减少 API 调用。权重从 SkillLoader.extractWeights() 获取，支持配队覆盖。
2. Claude 精细评分：对得分≥20的盘，注入完整 Skill 上下文（角色 + 配队），结合游戏知识深度分析

工具定义（供 Claude ReAct 调用）：

```typescript
const tools: Anthropic.Tool[] = [
  {
    name: "get_character_build",
    description:
      "获取指定角色的驱动盘培养标准，包含套装偏好、各槽主词条优先级、副词条权重",
    input_schema: {
      type: "object" as const,
      properties: {
        character_name: { type: "string", description: "角色中文名称" },
      },
      required: ["character_name"],
    },
  },
  {
    name: "get_all_characters",
    description: "获取系统中所有角色名称列表",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_disc_info",
    description: "从数据库获取指定驱动盘的完整信息",
    input_schema: {
      type: "object" as const,
      properties: {
        disc_id: { type: "integer", description: "驱动盘 ID" },
      },
      required: ["disc_id"],
    },
  },
];
```

评分输出格式（Claude 返回 JSON）：

```json
{
  "scores": {
    "艾莲": 78.5,
    "朱鸢": 12.0,
    "苍角": 45.0
  },
  "best_character": "艾莲",
  "team_context": "艾莲冰队",
  "analysis": "该盘为极地重金属4号位暴击率，主词条正确，副词条含双暴2条+攻击%，对艾莲评分优秀。在艾莲冰队中因莱卡恩 buff 暴击率权重降低，暴伤权重提升。"
}
```

### 9.6 OptimizerAgent（全局分配优化）

模式：Plan-and-Execute + Reflection（最多 3 轮迭代）

核心问题：多角色驱动盘分配是一个约束优化问题

- 约束：每块盘只能给一个角色；每个角色每个槽位只能有一块
- 目标：最大化所有角色的总评分
- 优先级：S 级角色优先保证，A 级其次
- 配队感知：分配时使用配队上下文的评分（如有）

执行流程：

1. Step 1 (Plan): Claude 读取所有 keep 状态盘的评分矩阵，生成初始分配方案
2. Step 2 (Execute): 计算方案总分（本地计算，无需 LLM）
3. Step 3 (Reflect): Claude 分析方案，寻找可改进的盘交换点
4. Step 4 (Repeat): 若有改进则更新方案，否则停止（最多 3 轮）
5. Step 5 (Save): 将最优方案写入 assignment_snapshots 表

Reflect Prompt 关键要点：

```text
请检查以下分配方案中是否存在改进空间：

1. 有没有某个角色的某个槽位，和另一个角色的同槽位盘互换后，整体总分更高？
2. 有没有某块盘分配给了次优角色，换给更合适的角色能提升整体分？
3. S级角色的核心槽位（4/5/6号位）是否已获得最高分的盘？

如果发现可改进点，输出改进后的完整方案；如无改进，输出 "improved": false。
```

### 9.7 UpgradeAgent（升级决策）

模式：ReAct + Reflection（每 +3 级一个观察点）

升级观察点：+0→+3→+6→+9→+12→+15

在 +3、+6 时新增 1 条副词条，+9、+12、+15 时强化已有副词条。

每个观察点的 Reflect Prompt：

```text
当前驱动盘状态：[disc_data]
目标角色：[character] （需求：双暴+攻击%）
配队上下文：[team]（如有，使用配队微调权重）
当前副词条：[sub_stats]
当前等级：+[level]

分析：

1. 已出现的有价值副词条数量：X条
2. 剩余强化次数：Y次（满级还需升X次）
3. 期望值判断：继续升级是否值得？

标准：

- +9 之前，如果0条有价值副词条 → 废弃
- +9 时，如果<1条核心副词条 → 废弃
- +12 时，如果<2条核心副词条 → 废弃
- +15 时，如果≥3条核心副词条 → 优秀，考虑更换角色装备

输出 JSON：{"action": "继续升级|保留当前等级|废弃", "reason": "..."}
```

数据库更新时机：每个观察点后立即更新，无论是否继续。

### 9.8 OrchestratorAgent（主协调）

模式：Plan-and-Execute + 配队感知

配队感知流程：

```text
用户指令："帮艾莲配盘"
        │
        ▼
  解析意图，提取目标角色：艾莲
        │
        ├── 用户是否指定了配队？
        │     ├── 是 → 直接使用
        │     └── 否 → 调用 recommend_team 工具
        │
        ▼
  recommend_team("艾莲")
        │
        ├── SkillLoader.findTeamsForCharacter("艾莲")
        │   → ["艾莲冰队", "艾莲速切队", ...]
        ├── 查数据库：用户是否拥有队友角色
        │   → 莱卡恩: 有, 苍角: 有
        ├── 返回推荐列表
        │
        ▼
  向用户确认配队选择
        │
        ▼
  确定 team 上下文，传递给所有下游 Agent
```

recommend_team 工具定义：

```json
{
  "name": "recommend_team",
  "description": "根据用户已有角色和可用配队 Skills，推荐最优配队方案。当用户想配盘但没有指定配队时调用。",
  "input_schema": {
    "type": "object",
    "properties": {
      "target_character": { "type": "string", "description": "目标角色名称" }
    },
    "required": ["target_character"]
  }
}
```

支持的自然语言指令示例：

- "扫描我所有的驱动盘并导入数据库"
- "帮我给艾莲找最好的驱动盘配置"
- "帮艾莲冰队配盘"（直接指定配队）
- "升级数据库里评分最高的未培养驱动盘"
- "全流程走一遍：扫描、评分、分配、然后升级最优先的盘"
- "重新优化一下艾莲和朱鸢的驱动盘分配"
- "废弃所有评分低于30分的驱动盘"

Plan 输出格式：

```json
{
  "context": {
    "target_characters": ["艾莲"],
    "team": "艾莲冰队",
    "team_members": ["艾莲", "莱卡恩", "苍角"]
  },
  "steps": [
    {
      "step": 1,
      "agent": "evaluator",
      "action": "score_for_character",
      "params": { "character": "艾莲", "team": "艾莲冰队" },
      "reason": "使用配队微调权重评分"
    },
    {
      "step": 2,
      "agent": "optimizer",
      "action": "optimize_assignment",
      "params": { "team": "艾莲冰队" },
      "reason": "在配队上下文下全局分配"
    }
  ]
}
```

---

## 十、Claude API 调用规范

### 10.1 模型选择

| 场景                 | 模型                      | 原因                   |
| -------------------- | ------------------------- | ---------------------- |
| 所有决策、评分、优化 | claude-opus-4-6           | 默认，推理能力最强     |
| 简单文本提取         | claude-haiku-4-5-20251001 | 可选，用于高频批量识别 |

### 10.2 必须使用 Streaming 的场景

- max_tokens > 4096 时必须用流式调用
- OptimizerAgent 的 Plan 阶段（输出可能较长）

```typescript
// 流式调用写法
const stream = client.messages.stream({ ... });
const final = await stream.finalMessage();
```

### 10.3 Prompt Caching 规则

- 缓存内容：Skills 知识上下文（SkillLoader.loadContext() 生成的文本，约 2000~5000 tokens）
- 缓存标记：`cache_control: { type: "ephemeral" }`，缓存有效期 5 分钟
- 注意：缓存内容必须放在 system 列表的第一个元素，且内容必须完全一致才命中缓存
- 配队感知影响缓存命中：相同角色+相同配队的请求会命中缓存，切换配队则重新缓存

### 10.4 Adaptive Thinking 使用规范

```typescript
// 复杂推理（评分、分配优化、升级决策）使用 adaptive thinking
thinking: {
  type: "adaptive";
}

// 简单任务（文本提取、状态判断）不需要 thinking
// → 不传 thinking 参数，节省 token
```

### 10.5 Vision API 调用规范

```typescript
// 图像必须 base64 编码
{
  type: "image",
  source: {
    type: "base64",
    media_type: "image/png", // 或 image/jpeg
    data: "<base64_string>",
  },
}

// 图像建议压缩到 1920x1080 以内，超大图会消耗更多 token
```

---

## 十一、屏幕捕获与 UI 导航规范

### 11.1 分辨率适配

```typescript
// src/config.ts
export const config = {
  gameResolution: { width: 1920, height: 1080 } as const,
  windowTitle: "绝区零",
  // 所有 UI 坐标使用相对比例，而非硬编码像素值
  // 例：背包翻页按钮在右下角约 (0.92, 0.88) 的位置
} as const;
```

### 11.2 RegionDetector 需要识别的 UI 区域

| 区域                 | 用途                  |
| -------------------- | --------------------- |
| 驱动盘背包格子区域   | Scanner 扫描所有盘    |
| 当前选中盘的详情面板 | 读取单块盘详细信息    |
| 强化按钮位置         | UpgradeAgent 执行强化 |
| 翻页按钮位置         | Scanner 翻页          |
| 角色装备界面         | 读取已装备状态        |

### 11.3 截图实现

```typescript
// src/capture/screen-capture.ts

import screenshot from "screenshot-desktop";
import sharp from "sharp";

export class ScreenCapture {
  /** 全屏截图 */
  async captureFullScreen(): Promise<Buffer> {
    return screenshot({ format: "png" });
  }

  /** 截指定区域（全屏 + sharp 裁剪） */
  async captureRegion(region: {
    left: number;
    top: number;
    width: number;
    height: number;
  }): Promise<Buffer> {
    const full = await this.captureFullScreen();
    return sharp(full).extract(region).toBuffer();
  }

  /** 转 base64，用于发送给 Claude Vision */
  async captureAsBase64(region?: {
    left: number;
    top: number;
    width: number;
    height: number;
  }): Promise<string> {
    const buf = region
      ? await this.captureRegion(region)
      : await this.captureFullScreen();
    return buf.toString("base64");
  }

  /** 压缩图片到目标尺寸内，节省 Vision token */
  async resize(
    buf: Buffer,
    maxWidth = 1920,
    maxHeight = 1080,
  ): Promise<Buffer> {
    return sharp(buf)
      .resize(maxWidth, maxHeight, { fit: "inside" })
      .png()
      .toBuffer();
  }
}
```

---

## 十二、数据库操作规范（DB 类接口）

```typescript
// src/database/db.ts

import Database from "better-sqlite3";

export class DB {
  private db: Database.Database;

  constructor(dbPath = "zzz_discs.db") {
    // 初始化时自动执行 schema.sql 建表
  }

  // 驱动盘 CRUD
  insertDisc(disc: DriveDisc): number { ... }       // 返回新增 id
  discExists(fingerprint: string): boolean { ... }
  getDisc(discId: number): DriveDisc | null { ... }
  updateDisc(discId: number, data: Partial<DriveDisc>): void { ... }
  updateDiscStatus(discId: number, status: DiscStatus): void { ... }
  getDiscsByStatus(status: DiscStatus): DriveDisc[] { ... }
  getAllDiscs(): DriveDisc[] { ... }

  // 评分矩阵（支持配队上下文）
  updateScore(discId: number, char: string, score: number, team?: string): void { ... }
  getScoreMatrix(team?: string): Record<number, Record<string, number>> { ... }
  getBestDiscForChar(char: string, slot: number, team?: string): DriveDisc | null { ... }

  // 升级日志
  logUpgrade(discId: number, fromLv: number, toLv: number, newSub: object, decision: string): void { ... }

  // 分配方案
  saveAssignment(plan: object, score: number, team?: string): void { ... }
  getActiveAssignment(team?: string): object | null { ... }

  // 统计信息（供 Orchestrator Plan 参考）
  getStats(): { total: number; unreviewed: number; keep: number; discard: number; equipped: number } { ... }
  // 返回示例：{"total": 120, "unreviewed": 45, "keep": 30, "discard": 20, "equipped": 25}
}
```

`better-sqlite3` 为同步 API，不需要 `await`，与 Python sqlite3 体验一致。

---

## 十三、执行层规范（ActionExecutor）

```typescript
// src/action/executor.ts

import { mouse, screen, Point, straightTo } from "@nut-tree/nut-js";
import { createInterface } from "readline/promises";

export class ActionExecutor {
  private auto: boolean;

  constructor(autoExecute = false) {
    this.auto = autoExecute;
    mouse.config.mouseSpeed = 300;
  }

  /** 建议模式下需要人工确认 */
  private async confirm(actionDesc: string): Promise<boolean> {
    if (this.auto) return true;
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = await rl.question(`[确认] 执行「${actionDesc}」? [y/n]: `);
    rl.close();
    return ans.trim().toLowerCase() === "y";
  }

  /**
   * relative=true 时，x/y 为相对屏幕比例（0~1），自动换算为像素
   * 操作前加 0.1~0.3s 随机延迟防检测
   */
  async click(x: number, y: number, relative = true): Promise<void> {
    let px = x;
    let py = y;
    if (relative) {
      const screenSize = await screen.size();
      px = Math.round(x * screenSize.width);
      py = Math.round(y * screenSize.height);
    }
    if (!(await this.confirm(`点击 (${px}, ${py})`))) return;
    const ms = 100 + Math.random() * 200;
    await new Promise((r) => setTimeout(r, ms));
    await mouse.move(straightTo(new Point(px, py)));
    await mouse.leftClick();
  }

  /** 点击强化按钮一次 */
  async upgradeDiscOnce(): Promise<void> { ... }

  /** 导航到驱动盘背包界面 */
  async openDiscInventory(): Promise<void> { ... }

  /** 选中背包中第 N 个格子的驱动盘 */
  async selectDisc(gridPosition: number): Promise<void> { ... }
}
```

---

## 十四、配置与工具链

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src"]
}
```

### package.json

```json
{
  "name": "zzz-disc-agent",
  "type": "module",
  "scripts": {
    "dev": "bun run src/index.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "@nut-tree/nut-js": "^4.2.0",
    "better-sqlite3": "^11.0.0",
    "screenshot-desktop": "^1.15.0",
    "sharp": "^0.33.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "bun-types": "latest",
    "typescript": "^5.7.0"
  }
}
```

### .env

```text
ANTHROPIC_API_KEY=sk-ant-xxx
```

Bun 原生支持 `.env`，无需 `dotenv` 包。

### 运行

```bash
bun install        # 安装依赖
bun run dev        # 启动
```

---

## 十五、实现优先级与开发路线

### Phase 1：基础框架（核心功能）

1. src/database/schema.sql + src/database/db.ts — 建库建表
2. src/database/models.ts — Zod 数据模型
3. knowledge/ 目录结构 + 示例 SKILL.md 文件（角色、配队、评分规则）
4. src/knowledge/skill-loader.ts — SkillLoader 类
5. src/knowledge/local-scorer.ts — LocalScorer 类
6. src/agents/base-agent.ts — BaseAgent + SkillLoader + Prompt Caching

### Phase 2：识别与评分

7. src/capture/screen-capture.ts — 截图工具
8. src/agents/scanner-agent.ts — 扫描导入（先做单页，再做翻页）
9. src/agents/evaluator-agent.ts — 评分（先做本地快速评分，再接 Claude）

### Phase 3：决策与优化

10. src/agents/optimizer-agent.ts — 分配优化
11. src/agents/upgrade-agent.ts — 升级决策

### Phase 4：执行与协调

12. src/action/executor.ts — 鼠标执行（先做空实现+日志）
13. src/capture/ui-navigator.ts — UI 导航
14. src/agents/orchestrator.ts — 主协调 Agent（含 recommend_team 配队感知）
15. src/index.ts — 主入口

### Phase 5：完善

16. src/capture/region-detector.ts — 精细化 UI 区域检测
17. 日志、错误处理、重试机制
18. 更多角色和配队的 SKILL.md 知识文件

---

## 十六、注意事项与风险提示

1. **API Key 安全**：ANTHROPIC_API_KEY 必须放在 .env 文件，.env 加入 .gitignore，永远不要硬编码到代码中
2. **反作弊风险**：autoExecute=true 模式下的鼠标模拟存在封号风险，由用户自行承担
3. **截图区域硬编码**：UI 坐标在不同分辨率下会变化，必须基于相对比例或图像模板匹配定位
4. **Claude Vision 识别错误**：中文字体可能识别错误，需要对数值做合理范围校验（如暴击率不应超过 100%）
5. **token 控制**：单次扫描一页背包可能有多块盘，注意图像 token 消耗；批量操作建议分批处理
6. **数据库事务**：升级操作涉及多表更新，使用事务保证一致性
7. **Skills 格式一致性**：SKILL.md 中 HTML 注释标记必须严格匹配，否则 SkillLoader 无法提取权重数据
