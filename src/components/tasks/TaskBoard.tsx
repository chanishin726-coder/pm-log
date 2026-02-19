'use client';

import { useQuery } from '@tanstack/react-query';
import { TaskCard } from './TaskCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getTaskState, type TaskState } from '@/lib/task-state';
import type { Task } from '@/types/database';

interface TaskBoardProps {
  initialTasks?: Task[];
}

export function TaskBoard({ initialTasks = [] }: TaskBoardProps) {
  const { data: tasks = initialTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await fetch('/api/tasks');
      if (!res.ok) throw new Error('Failed to fetch tasks');
      return res.json();
    },
    initialData: initialTasks.length > 0 ? initialTasks : undefined,
  });

  const filterByState = (state: TaskState | null) => {
    if (!tasks || !Array.isArray(tasks)) return [];
    return tasks.filter((t: Task) => getTaskState(t) === state);
  };

  const highTasks = filterByState('high');
  const mediumTasks = filterByState('medium');
  const lowTasks = filterByState('low');
  /** D AI 추천 = task_state null (미분류)인 할일. API가 이미 task_id_tag 있거나 no_task_needed false인 것만 반환하므로 null이면 해당 */
  const reviewTasks = (tasks ?? []).filter((t: Task) => getTaskState(t) === null);
  const doneTasks = filterByState('done');
  const allTasksCount = tasks?.length ?? 0;

  return (
    <div className="w-full overflow-hidden">
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-6 min-h-[44px] sm:min-h-9 gap-0 p-0.5">
          <TabsTrigger value="all" className="relative min-h-[40px] sm:min-h-0 text-xs sm:text-sm py-2">
            전체
            {allTasksCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {allTasksCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="A" className="relative min-h-[40px] sm:min-h-0 text-xs sm:text-sm py-2">
            A 우선
            {highTasks.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {highTasks.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="B" className="relative min-h-[40px] sm:min-h-0 text-xs sm:text-sm py-2">
            B 후순위
            {mediumTasks.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {mediumTasks.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="C" className="relative min-h-[40px] sm:min-h-0 text-xs sm:text-sm py-2">
            C 대기
            {lowTasks.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {lowTasks.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="D" className="relative min-h-[40px] sm:min-h-0 text-xs sm:text-sm py-2">
            D AI추천
            {reviewTasks.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {reviewTasks.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="X" className="relative min-h-[40px] sm:min-h-0 text-xs sm:text-sm py-2">
            X 완료
            {doneTasks.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-slate-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {doneTasks.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4 mt-4">
          {allTasksCount === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              할일이 없습니다
            </p>
          ) : (
            <>
              {highTasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground px-1">A 우선</p>
                  {highTasks.map((task: Task) => <TaskCard key={task.id} task={task} />)}
                </div>
              )}
              {mediumTasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground px-1">B 후순위</p>
                  {mediumTasks.map((task: Task) => <TaskCard key={task.id} task={task} />)}
                </div>
              )}
              {lowTasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground px-1">C 대기</p>
                  {lowTasks.map((task: Task) => <TaskCard key={task.id} task={task} />)}
                </div>
              )}
              {reviewTasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground px-1">D AI추천</p>
                  {reviewTasks.map((task: Task) => (
                    <TaskCard key={task.id} task={task} isReview />
                  ))}
                </div>
              )}
              {doneTasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground px-1">X 완료</p>
                  {doneTasks.map((task: Task) => <TaskCard key={task.id} task={task} />)}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="A" className="space-y-2 mt-4">
          {highTasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              우선순위 할일이 없습니다
            </p>
          ) : (
            highTasks.map((task: Task) => <TaskCard key={task.id} task={task} />)
          )}
        </TabsContent>

        <TabsContent value="B" className="space-y-2 mt-4">
          {mediumTasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              후순위 할일이 없습니다
            </p>
          ) : (
            mediumTasks.map((task: Task) => <TaskCard key={task.id} task={task} />)
          )}
        </TabsContent>

        <TabsContent value="C" className="space-y-2 mt-4">
          {lowTasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              대기 중인 할일이 없습니다
            </p>
          ) : (
            lowTasks.map((task: Task) => <TaskCard key={task.id} task={task} />)
          )}
        </TabsContent>

        <TabsContent value="D" className="space-y-2 mt-4">
          {reviewTasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              AI 추천 항목이 없습니다
            </p>
          ) : (
            reviewTasks.map((task: Task) => (
              <TaskCard key={task.id} task={task} isReview />
            ))
          )}
        </TabsContent>

        <TabsContent value="X" className="space-y-2 mt-4">
          {doneTasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              완료된 할일이 없습니다
            </p>
          ) : (
            doneTasks.map((task: Task) => <TaskCard key={task.id} task={task} />)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
