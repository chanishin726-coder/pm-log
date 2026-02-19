import { z } from 'zod';

const projectCodeSchema = z.string().min(2).max(4).regex(/^[가-힣a-zA-Z0-9]+$/, '2~4자 코드 (한글/영문/숫자)');

export const createProjectSchema = z.object({
  name: z.string().min(1, '프로젝트명을 입력하세요'),
  code: projectCodeSchema,
  description: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  code: projectCodeSchema.optional(),
  description: z.string().optional(),
  status: z.enum(['active', 'completed', 'hold']).optional(),
});

export const createLogSchema = z.object({
  rawInput: z.string().min(1, '로그 내용을 입력하세요'),
});

const logTypeEnum = z.enum(['F', 'T', 'W', 'I']);
const taskStateEnum = z.enum(['high', 'medium', 'low', 'review', 'done']);

export const updateLogSchema = z.object({
  content: z.string().optional(),
  log_type: logTypeEnum.optional(),
  category_code: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  task_id_tag: z.string().nullable().optional(),
  task_state: taskStateEnum.nullable().optional(),
  project_id: z.union([z.string().uuid(), z.literal(''), z.null()]).optional(),
  log_date: z.string().min(1).optional(),
});

export const createTaskSchema = z.object({
  project_id: z.string().uuid(),
  task_id_tag: z.string().optional(),
  description: z.string().min(1, '설명을 입력하세요'),
  priority: z.enum(['high', 'medium', 'low']).optional(),
});

export const updateTaskStateSchema = z.object({
  state: z.enum(['high', 'medium', 'low', 'review', 'done']).nullable(),
});

export const querySchema = z.object({
  query: z.string().min(1, '질문을 입력하세요'),
});
