import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, '프로젝트명을 입력하세요'),
  code: z.string().min(2).max(4).regex(/^[가-힣a-zA-Z0-9]+$/, '2~4자 코드 (한글/영문/숫자)'),
  description: z.string().optional(),
});

export const createLogSchema = z.object({
  rawInput: z.string().min(1, '로그 내용을 입력하세요'),
});

export const updateTaskStateSchema = z.object({
  state: z.enum(['high', 'medium', 'low', 'review', 'done']).nullable(),
});

export const querySchema = z.object({
  query: z.string().min(1, '질문을 입력하세요'),
});
