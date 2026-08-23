# Tasks Hub data model

Hierarchy for planning work, with cross-cutting tags and a Someday / Maybe holding pen.

## Tree

```
Area / Category
  └── Goal
        └── Project
              ├── Milestone (checkpoint — not a task)
              └── Task
                    └── Step
```

| Entity | Role |
|--------|------|
| **Area** | Broad life/work bucket (Teaching, Life, …). |
| **Goal** | Outcome under an area. |
| **Project** | Deliverable arc under a goal. Carries `milestones[]` inline. |
| **Task** | Actionable work on the board, day/week views, and backlog. |
| **Step** | Checklist item under a task (`kind: "step"`, `parent_task_id`). |
| **Milestone** | Date/status checkpoint on a project — not shown on the sprint board. |

## Cross-cutting

- **Tags / labels** — on goals, projects, and tasks (`tags: string[]`).
- **Someday / Maybe** — off-tree ideas (`bucket: "someday"`). Promote to goal, project, or active task from **Plan → Someday**.

## Board visibility

The sprint board, day/week focus, open tasks, and backlog include only **active board tasks**:

- `kind !== "step"` (and not legacy child rows treated as steps)
- `bucket !== "someday"`

Steps stay with their parent in the task editor. Someday items live on `#/someday`.

## APIs

| Resource | Mock / Netlify |
|----------|----------------|
| Areas | `GET/POST /api/areas`, `PATCH/DELETE /api/areas/:id` |
| Goals | `GET/POST /api/goals`, `PATCH/DELETE /api/goals/:id` |
| Projects | existing — now accepts `parent_goal_id`, `tags` |
| Tasks | existing — now accepts `kind`, `bucket`, `step_order` |

## Seed

`fixtures/seed.json` includes demo areas, goals, a step under the lesson-pack task, and a someday podcast idea.
