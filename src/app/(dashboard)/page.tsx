import { QuickInput } from '@/components/logs/QuickInput';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { SyncButton } from '@/components/dashboard/SyncButton';
import { createClient } from '@/lib/supabase/server';
import { getEffectiveUserId } from '@/lib/auth';

export default async function DashboardPage() {
  const supabase = await createClient();
  const userId = await getEffectiveUserId(supabase);
  if (!userId) return null;

  const { data: taskLogs } = await supabase
    .from('logs')
    .select('id, user_id, project_id, log_date, content, task_id_tag, task_state, created_at, source, project:projects(id, name, code)')
    .eq('user_id', userId)
    .not('project_id', 'is', null)
    .or('task_state.not.is.null,task_id_tag.not.is.null')
    .order('created_at', { ascending: false })
    .limit(200);
  type ProjectShape = { id: string; name: string; code: string } | null;
  const todayTasks = (taskLogs ?? [])
    .map((l) => {
      if (!l.project_id) return null;
      const rawProject = (l as { project?: ProjectShape | ProjectShape[] }).project;
      const project: ProjectShape = Array.isArray(rawProject) ? (rawProject[0] ?? null) : (rawProject ?? null);
      return {
        id: l.id,
        user_id: l.user_id,
        log_id: l.id,
        project_id: l.project_id,
        task_id_tag: l.task_id_tag ?? '',
        description: l.content,
        task_state: (l as { task_state?: string | null }).task_state ?? null,
        due_date: null,
        created_at: l.created_at,
        completed_at: null,
        ai_recommended: false,
        ai_reason: null,
        sort_order: 0,
        project,
        source: (l as { source?: string | null }).source ?? null,
      };
    })
    .filter(Boolean) as Parameters<typeof TaskBoard>[0]['initialTasks'];

  const { data: recentLogs } = await supabase
    .from('logs')
    .select('id, log_date, log_type, content, project:projects(id, name, code)')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto">
      <section>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h1 className="text-xl sm:text-2xl font-semibold">오늘 할일</h1>
          <SyncButton />
        </div>
        <TaskBoard initialTasks={todayTasks || []} />
      </section>

      <section>
        <h2 className="text-base sm:text-lg font-medium mb-2">최근 로그</h2>
        {recentLogs && recentLogs.length > 0 ? (
          <ul className="space-y-0 border rounded-lg divide-y overflow-hidden">
            {recentLogs.map((log) => (
              <li key={log.id} className="px-3 sm:px-4 py-3 flex flex-wrap gap-x-2 gap-y-1 text-sm min-h-[48px] items-center">
                <span className="text-muted-foreground shrink-0">{log.log_date}</span>
                <span className="font-mono text-xs shrink-0">{log.log_type}</span>
                <span className="shrink-0">{log.project?.name || '-'}</span>
                <span className="truncate min-w-0">{log.content}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">최근 로그가 없습니다.</p>
        )}
      </section>

      <section className="pb-4 sm:pb-8">
        <h2 className="text-base sm:text-lg font-medium mb-2">빠른 로그 입력</h2>
        <QuickInput />
      </section>
    </div>
  );
}
