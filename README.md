# TheAll Messenger

선생님과 조교가 학원 내부망에서 메시지를 주고받는 가벼운 데스크톱 앱.

## 현재 상태: 설계 진행 중

- **아키텍처 방향**: Synology NAS의 Container Manager에 Node.js(WebSocket) 백엔드를
  상시 컨테이너로 올리고, 선생님·조교 PC의 Electron 앱은 순수 클라이언트로
  LAN을 통해 접속. 메시지 저장(SQLite 등)은 NAS 로컬 파일시스템에 두어
  네트워크 공유(SMB/CIFS) 위의 DB 파일 손상 문제를 피함.
- **UI 목업(클릭 가능한 프로토타입)**:
  https://claude.ai/code/artifact/decaab63-37e5-4e5d-b928-ac62a6499cd8
- **아직 정하지 않은 것**: 메시지 저장 스키마, 인증 방식, 재연결/오프라인 큐잉
  처리, 대화 이력 보관 정책.

## 다음 단계

남은 설계 항목을 확정한 뒤 `docs/superpowers/specs/`에 정식 설계 문서를
작성하고, 그 문서를 기준으로 구현 계획을 세운다.
