import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/** 프로젝트 미지정(null)일 때 표시·필터에 쓰는 라벨. DB에 '기타' 프로젝트를 만들지 않음. */
export const NO_PROJECT_LABEL = '기타'

/** 로그 API projectId 파라미터: 이 값이면 project_id is null 로 필터 */
export const NO_PROJECT_FILTER_VALUE = '__none__'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 말끔의 #태그(공백 없이 붙어도 됨). 형식 예: #서센6020905 (YMMDDNN) */
const END_TAG_REGEX = /\s*#([A-Za-z0-9가-힣_]+)\s*$/

/** "SOURCE: 본문 #task_id_tag" 형태를 { source, content, task_id_tag } 로 분리. task_id_tag는 # 포함해 반환(예: #서센6020905) */
export function parseLogContent(fullContent: string): {
  source: string | null
  content: string
  task_id_tag: string | null
} {
  let rest = fullContent.trim()
  if (!rest) return { source: null, content: '', task_id_tag: null }

  let task_id_tag: string | null = null
  const tagMatch = rest.match(END_TAG_REGEX)
  if (tagMatch) {
    task_id_tag = '#' + tagMatch[1]
    rest = rest.slice(0, tagMatch.index).trim()
  }

  let source: string | null = null
  const colonMatch = rest.match(/^([^:]+):\s*(.*)$/s)
  if (colonMatch) {
    source = colonMatch[1].trim()
    rest = colonMatch[2].trim()
  }

  return { source, content: rest, task_id_tag }
}

/**
 * raw_input 또는 task_id_tag(#코드YMMDDNN)에서 등록된 프로젝트 코드와 매칭되는 코드 반환.
 * 뒤늦게 프로젝트 추가한 경우, 기존 로그의 project_id 반영용.
 */
export function extractProjectCodeFromRaw(
  rawInput: string,
  projectCodes: string[]
): string | null {
  if (!rawInput?.trim() || projectCodes.length === 0) return null
  const text = rawInput.trim()

  const { task_id_tag } = parseLogContent(text)
  if (task_id_tag) {
    const tagBody = task_id_tag.slice(1)
    const byLength = [...projectCodes].sort((a, b) => b.length - a.length)
    for (const code of byLength) {
      if (tagBody === code || tagBody.startsWith(code)) return code
    }
  }

  const byLength = [...projectCodes].sort((a, b) => b.length - a.length)
  for (const code of byLength) {
    if (text.includes(code)) return code
  }
  return null
}
