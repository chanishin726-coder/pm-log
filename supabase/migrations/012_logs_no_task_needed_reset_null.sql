-- AI에게 할일 여부를 다시 판단받기 위해 모든 로그의 no_task_needed를 NULL로 초기화
UPDATE logs SET no_task_needed = NULL;
