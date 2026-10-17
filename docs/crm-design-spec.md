# CRM 设计规格（Prompt 0 产出）

> 依据：`AGENTS.md`（项目约束）、需求文档《人加自用crm系统.docx》、现有源代码。
> 本文档只做规格，不写业务代码、不生成 migration。经确认后作为 Prompt 1–5 的编码依据。

---

## 0. 现有系统盘点（改造起点）

现有源代码是一套「客户沟通管理台」，技术栈 **Next.js 16 (vinext) + React 19 + Cloudflare D1 + Drizzle ORM**，单一访问密码登录，无角色概念。已存在 7 张表：

| 现有表 | 用途 | 处理方式 |
|---|---|---|
| `customers` | 客户（含沟通周期、级别、销售员字符串） | 重构为多角色 Account |
| `leads` | 线索（status 字符串） | 重构为六态 stage |
| `interactions` | 客户沟通纪要 | 并入统一 FollowUp |
| `customer_visits` | 客户拜访计划 | 并入统一 FollowUp |
| `network_contacts` | 人脉管理 | 一期保留（独立功能，不纳入 CRM 主体） |
| `network_interactions` | 人脉互动 | 一期保留 |
| `prototype_specs` | 产品原型 | 一期保留 |

**改造原则**：不破坏原有「人脉管理」「产品原型」功能；CRM 主体（账号/客户/联系人/线索/机会/跟进/附件/关注/阶段历史/操作日志）全部新建。不做数据迁移（旧 customers/leads 数据不自动搬入新模型，旧表保留只读或下线）。

---

## 1. 明确不做（一期范围外）

- ❌ 审批流（不建审批表，不建 `approval_status` 字段，不显示审批状态/审批记录/退回次数）
- ❌ 负责团队（不建 Team 表，直属上级只做直接上级不递归）
- ❌ 数据迁移（不迁移、不保留迁移功能）
- ❌ 开放注册（账号仅管理员创建）
- ❌ 邮件/短信/推送提醒（提醒只做列表铃铛 + 工作台）

---

## 2. 角色与可见性

### 2.1 角色（2 种）
- **管理员（admin）**：全部数据可见，可创建/停用账号、可恢复软删除、可查询操作日志、可导入导出。
- **销售（sales）**：受可见范围约束。

### 2.2 关系（User.manager_id 自引用）
- 直属上级：`manager_id` 指向另一用户，只做**直接上级**，不递归。
- 协同人（collaborator）：通过关联表挂到客户/线索/机会。

### 2.3 可见范围（owner / 协同人 / 直属上级 / 管理员）
- 客户、线索、销售机会使用**同一套可见性规则**。
- 机会继承客户可见性（客户可见 → 其名下机会可见）。
- 直属上级对下属数据：**只读 + 可分配**，不可编辑业务字段、不可完成下属待办。
- 协同人：可编辑业务字段、可新增/完成跟进、可推进阶段；**不可**改负责人、不可改协同人、不可删除、不可变更权限。
- 客户协同人自动继承其名下机会的编辑权；机会**不重复**添加协同人。
- 所有权限判断在**服务端 policy 层**；UI 隐藏不算权限控制。

---

## 3. 数据模型（字段清单）

通用审计字段（所有业务表）：`owner_id`、`created_at`、`updated_at`、`deleted_at`、`deleted_by`。

### 3.1 users（账号）
| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| id | integer PK | ✓ | 自增 | |
| name | text | ✓ | | 姓名 |
| username | text | ✓ | | 登录名，唯一 |
| password_hash | text | ✓ | | 密码哈希（bcrypt/scrypt） |
| role | text | ✓ | 'sales' | `admin` / `sales` |
| manager_id | integer | | null | 直属上级，自引用 users.id |
| active | boolean | ✓ | true | 停用=false |
| created_at / updated_at | text | ✓ | | |

### 3.2 accounts（客户）
| 字段 | 类型 | 必填 | 默认 | 枚举/说明 | 查重 |
|---|---|---|---|---|---|
| id | integer PK | ✓ | | | |
| name | text | ✓ | | 公司全称 | ✓ 全称完全相同 |
| owner_id | integer | ✓ | | 负责人 → users.id | |
| category | text | ✓ | '潜力' | `潜力`/`普通`/`VIP`（客户分类） | |
| stage | text | ✓ | '潜在' | 客户阶段（见状态机 §4.2） | |
| importance | text | ✓ | '普通' | `普通`/`重要`/`核心`（重要程度） | |
| province / city / address | text | | '' | 地址 | |
| industry | text | | '' | 客户行业 | |
| contact 电话 | — | | | 通过 contacts 表关联，任一联系人电话参与查重 | ✓ 电话相同 |
| last_followup_at | text | | null | 最后跟进时间（仅统计已完成跟进） | |

### 3.3 contacts（联系人，属于客户）
| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| id | integer PK | ✓ | | |
| account_id | integer FK | ✓ | | 所属客户，可见性继承客户 |
| name | text | ✓ | | |
| phone | text | | '' | 参与客户查重 |
| title | text | | '' | 职位 |
| email / wechat / remark | text | | '' | |
| owner_id / 审计字段 | — | ✓ | | |

### 3.4 leads（线索）
| 字段 | 类型 | 必填 | 默认 | 枚举/说明 | 查重 |
|---|---|---|---|---|---|
| id | integer PK | ✓ | | | |
| company_name | text | ✓ | | 企业全称 | ✓ |
| contact_name | text | | '' | | |
| contact_phone | text | | '' | 参与查重 | ✓ |
| source | text | ✓ | '主动拓展' | `主动拓展`/`客户转介绍`/`展会活动`/`网站咨询`/`合作伙伴`/`其他` | |
| stage | text | ✓ | '待处理' | 六态（见 §4.1） | |
| owner_id | integer | ✓ | | 负责人 | |
| invalid_reason | text | | '' | 无效终态必填 | |
| converted_account_id | integer | | null | 转化后写入 | |
| converted_at | text | | null | 转化时间 | |
| 审计字段 | — | ✓ | | | |

### 3.5 opportunities（销售机会）
| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| id | integer PK | ✓ | | |
| account_id | integer FK | ✓ | | **必填**，绑定客户 |
| name | text | ✓ | | 机会名称 |
| code | text | ✓ | 服务端生成 | 唯一，`OPP-YYYYMMDD-0001` |
| contact_id | integer | | null | 客户联系人 |
| stage | text | ✓ | '需求确认' | 销售阶段（见 §4.3） |
| sales_estimated_amount | real | ✓ | 0 | **销售预计金额**，列表筛选/汇总默认用 |
| project_amount | real | ✓ | 0 | **项目金额**，详情展示用 |
| expected_close_date | text | | '' | 预计结束日期 |
| importance | text | | '普通' | 重要程度 |
| owner_id | integer | ✓ | | 负责人 |
| requirement | text | | '' | 需求 |
| product_match | text | | '' | 产品匹配 |
| tech_owner | text | | '' | 技术负责人 |
| supporting_docs | text | | '' | 配套文档 |
| social_insurance_count | integer | | 0 | 社保人数 |
| review_opinion | text | | '' | 评审后意见 |
| action_plan | text | | '' | 后续行动计划（文本，不驱动待办） |
| remark | text | | '' | 备注 |
| is_draft | boolean | ✓ | false | 草稿状态 |
| 审计字段 | — | ✓ | | |

### 3.6 follow_ups（跟进记录，多态）
| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| id | integer PK | ✓ | | |
| owner_id | integer | ✓ | | 创建人 |
| target_type | text | ✓ | | `lead`/`account`/`opportunity` |
| target_id | integer | ✓ | | 多态外键 |
| status | text | ✓ | 'pending' | `pending`(待处理)/`completed`(已完成) |
| content | text | | '' | 跟进内容（待处理可空，已完成必填） |
| next_contact_at | text | | null | 下次联系时间（待处理必填） |
| completed_at | text | | null | 完成时间 |
| 审计字段 | — | ✓ | | |

> 规则：完成跟进时，仅当填写 `next_contact_at` 才生成下一条待处理记录；不填不生成，禁止空待办。

### 3.7 attachments（附件，多态）
| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| id | integer PK | ✓ | | |
| target_type | text | ✓ | | `lead`/`account`/`opportunity`/`follow_up` |
| target_id | integer | ✓ | | |
| kind | text | ✓ | | `image`/`file` |
| url | text | ✓ | | 存储地址 |
| name | text | | '' | 文件名 |
| 审计字段 | — | ✓ | | |

> 规则：图片最多 9 张，文件最多 9 份（按 target 分 kind 计数）；权限继承所属对象。

### 3.8 collaborators（协同人关联，多态）
| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| id | integer PK | ✓ | | |
| target_type | text | ✓ | | `lead`/`account`/`opportunity` |
| target_id | integer | ✓ | | |
| user_id | integer | ✓ | | 协同人 |

### 3.9 watches（关注/收藏）
| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| id | integer PK | ✓ | | |
| user_id | integer | ✓ | | 个人可见 |
| target_type / target_id | — | ✓ | | 收藏对象 |

### 3.10 stage_histories（阶段历史）
| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| id | integer PK | ✓ | | |
| target_type | text | ✓ | | `lead`/`account`/`opportunity` |
| target_id | integer | ✓ | | |
| from_stage / to_stage | text | ✓ | | 变更前后 |
| changed_by | integer | ✓ | | 操作人 |
| changed_at | text | ✓ | | |

### 3.11 operation_logs（操作日志）
| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| id | integer PK | ✓ | | |
| actor_id | integer | ✓ | | 操作人 |
| action | text | ✓ | | create/update/delete/convert/assign/import/export/disable |
| target_type / target_id | text | | null | 对象 |
| before / after | text | | null | 变更前后摘要（JSON） |
| created_at | text | ✓ | | |

---

## 4. 状态机

### 4.1 线索（Lead）stage 六态
```
待处理 → 跟进中 → 提交需求 → 确认需求 → 已转化
                                      ↘ 无效（任意前序态可转，终态）
```
- 「已转化」「无效」为终态。
- 顶部进度条只展示：`提交需求 / 确认需求 / 已转化 / 无效`；`待处理 / 跟进中`在列表和基础信息展示。
- 「转化客户」是动作：转化后 stage=已转化，写 `converted_account_id`、`converted_at`；**不物理删除线索**，原跟进记录保留可追溯。
- 无效必须记录 `invalid_reason` 和操作人。
- 校验：进入「无效」无 invalid_reason → 报错；未转化不能建机会（调机会创建接口返回 400）。

### 4.2 客户（Account）阶段
```
潜在 → 意向 → 合作中 → 流失
```
- 客户「分类」（潜力/普通/VIP）与「阶段」是**两个独立维度**，互不映射。
- 阶段变更写 stage_histories。

### 4.3 销售机会（Opportunity）阶段
```
需求确认 → 方案报价 → 商务谈判 → 赢单 / 丢单
```
- 需求文档中出现的「暂停」「跟进」映射到机会的销售阶段枚举内（见 §7 映射）。
- 阶段变更写 stage_histories。

### 4.4 跟进记录（FollowUp）
```
pending（待处理） → completed（已完成）
```
- pending：content 可空，`next_contact_at` **必填**。
- completed：content **必填**。
- completed 且填了 next_contact_at → 自动生成下一条 pending；不填不生成。

---

## 5. 权限矩阵

**图例**：R=读，W=写（编辑业务字段），A=分配，D=删除，C=创建，F=完成跟进/推进阶段

| 对象 | 管理员 | 负责人(owner) | 协同人 | 直属上级 | 其他销售 |
|---|---|---|---|---|---|
| 客户 | R W A D C | R W A D C | R W（不可改负责人/协同人/不可删/不可改权限） | R A（只读可分配） | ✕ |
| 线索 | R W A D C | R W A D C | R W（同上） | R A | ✕ |
| 机会 | R W A D C | R W A D C | R W（同上） | R A | ✕ |
| 联系人 | 继承客户 | 继承客户 | 继承客户 | 继承客户(只读) | ✕ |
| 跟进记录 | R W | R W C F | R W C F（不可改负责人） | R（只读，不可完成下属待办） | ✕ |
| 附件 | R W | R W | R W | R | ✕ |
| 关注 | — | — | — | — | 仅本人 |
| 账号管理 | R W C 停用 | ✕ | ✕ | ✕ | ✕ |
| 操作日志 | R | ✕ | ✕ | ✕ | ✕ |
| 导入导出 | R W | 受可见性约束 | 受可见性约束 | 受可见性约束 | 受可见性约束 |

**越权测试点**（Prompt 1 自动化测试）：销售 A 不能读销售 B 客户；直属上级能读下属但不能编辑；协同人能编辑不能改负责人；未转化线索调机会接口返回 400。

---

## 6. 页面 - API 映射

### 6.1 登录
| 页面 | 接口 | 说明 |
|---|---|---|
| 登录页 | POST /api/auth/login | 返回 session + current_user(id/role/manager_id) |
| — | POST /api/auth/logout | |

### 6.2 客户
| 页面 | 接口 | 筛选/说明 |
|---|---|---|
| 客户列表 | GET /api/accounts | 负责人/客户分类/客户阶段/重要程度/最后跟进时间/关键词 |
| 客户详情 | GET /api/accounts/:id | 基础信息+联系人+跟进+阶段历史+附件 |
| 新建/编辑 | POST/PATCH /api/accounts | 含查重提示 |
| 转负责人 | PATCH /api/accounts/:id/assign | 直属上级/管理员可操作 |
| 查重 | POST /api/accounts/check-duplicate | 全称或电话命中提示 |

### 6.3 联系人
| 页面 | 接口 |
|---|---|
| 列表/新建 | GET/POST /api/accounts/:id/contacts |
| 编辑/删除 | PATCH/DELETE /api/contacts/:id |

### 6.4 线索
| 页面 | 接口 | 说明 |
|---|---|---|
| 线索列表 | GET /api/leads | stage/来源/负责人/关键词 |
| 线索详情 | GET /api/leads/:id | 顶部进度条(4态)+基础信息+跟进 |
| 新建/编辑 | POST/PATCH /api/leads | |
| 转化客户 | POST /api/leads/:id/convert | 事务：建客户+可选联系人+写 converted 字段+stage=已转化 |
| 标记无效 | PATCH /api/leads/:id/invalid | 必填 invalid_reason |

### 6.5 销售机会
| 页面 | 接口 | 说明 |
|---|---|---|
| 机会列表 | GET /api/opportunities | 名称/编号/客户/联系人/阶段/负责人/预计金额/预计结束日期 |
| 机会详情 | GET /api/opportunities/:id | 双金额+技术负责人+配套文档+社保人数+评审意见+行动计划+附件+协同人 |
| 新建(从客户) | POST /api/opportunities | account_id 必填，编号服务端生成 |
| 导入 | POST /api/opportunities/import | 必须匹配已有客户，匹配不到报错不入库 |

### 6.6 跟进与工作台
| 页面 | 接口 | 说明 |
|---|---|---|
| 跟进列表 | GET /api/follow-ups?target=... | 多态 |
| 新增跟进 | POST /api/follow-ups | |
| 完成跟进 | PATCH /api/follow-ups/:id/complete | 填 next_contact_at 才生成下一条 |
| 工作台-我的待办 | GET /api/dashboard/todos | owner 或协同人的 pending |
| 工作台-下属逾期 | GET /api/dashboard/subordinate-overdue | 仅直属上级，只读 |

### 6.7 附件/关注/提醒
| 页面 | 接口 |
|---|---|
| 附件上传 | POST /api/attachments（图片≤9，文件≤9） |
| 关注切换 | POST/DELETE /api/watches |
| 提醒铃铛 | GET /api/reminders（数据源 next_contact_at） |

### 6.8 导入/导出/日志/账号
| 页面 | 接口 |
|---|---|
| 导入预览 | POST /api/import/preview（逐行校验+查重，错误行不入库） |
| 导入确认 | POST /api/import/confirm |
| 导出 | GET /api/export?type=...（与列表同权限同计数） |
| 账号管理 | POST /api/users（管理员）、POST /api/users/:id/disable（指定接收人转移） |
| 操作日志 | GET /api/operation-logs（管理员，按对象/操作人查询） |

---

## 7. 需求文档字段 → 数据模型映射

需求文档《人加自用crm系统.docx》销售机会表格字段与模型对应：

| 文档字段 | 模型字段 |
|---|---|
| 序号 | opportunities.code 后 4 位 |
| 客户名 | accounts.name |
| 需求 | opportunities.requirement |
| 需求日期 | opportunities.requirement_date（新增） |
| 后续行动计划 | opportunities.action_plan |
| 销售意见 | opportunities.sales_opinion（新增） |
| 项目金额 | opportunities.project_amount |
| 需求数量 | opportunities.quantity（新增） |
| 技术负责人 | opportunities.tech_owner |
| 配套文档 | opportunities.supporting_docs |
| 社保人数 | opportunities.social_insurance_count |
| 客户行业 | accounts.industry |
| 评审后意见 | opportunities.review_opinion |
| 暂停/跟进 | opportunities.stage（映射：暂停→丢单/暂缓，跟进→商务谈判/需求确认，见 §4.3） |

> 补充字段（需求文档新增，超出 AGENTS.md 基础清单）：`requirement_date`（需求日期）、`sales_opinion`（销售意见）、`quantity`（需求数量）。已并入 §3.5 opportunities 模型。

---

## 8. 手机端核心路径（Prompt 5）

保证：登录 → 工作台待办 → 线索/客户详情 → 新增跟进。触控目标 ≥44px；表格窄屏转卡片或横向滚动。管理员导入/分配桌面优先。

---

## 9. 总验收清单（对齐提示词包）

- [ ] 未出现审批表、approval_status 字段、退回次数、负责团队表
- [ ] 线索六态；转化不删线索，原跟进可追溯
- [ ] 未转化线索不能建机会；机会必有 account_id
- [ ] 销售不可见非 owner/非协同人/非下属数据；直属上级只读可分配；协同人可编辑不可改负责人
- [ ] 跟进：待处理可空内容但必填下次时间；已完成必填内容；不产生空待办
- [ ] 工作台区分「我的待办」/「下属逾期」
- [ ] 双金额字段：sales_estimated_amount（列表筛选汇总）、project_amount（详情）
- [ ] 草稿不参与查重/导出/待办，列表默认不显示
- [ ] 导入先预览后确认，错误行零入库；机会导入匹配不到客户报错
- [ ] 导出数量与列表一致，权限过滤正确
- [ ] 操作日志覆盖 create/update/delete/convert/assign/import/export/disable
- [ ] 手机端可完成 登录→待办→详情→新增跟进
