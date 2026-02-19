-- source 필드 역할 정의 명확화 (타입별 의미)
COMMENT ON COLUMN logs.source IS 'F(수신)=나에게 연락한 상대, T(발신)=내가 연락한 상대, W(실행)=관련 당사자, I(정보)=정보 출처. W/I는 없을 수 있음.';
