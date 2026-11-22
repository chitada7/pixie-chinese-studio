# Pixie Chinese Studio

HSK 3.0 3급(2027년 1월 9일 시험) 대비 중국어 단어·문법 학습 웹앱.

- 사이트: https://chitada7.github.io/pixie-chinese-studio/
- 아이폰 Safari에서 열고 공유 → **홈 화면에 추가**하면 앱처럼 쓸 수 있어요.
- 학습 기록은 기기(Safari)에 저장돼요. 설정 → 기록 내보내기로 가끔 백업하세요.

## 구성
- `index.html`, `app.js`, `style.css`: 앱
- `data.json`: 단어 1,293개(기존 563 + 새 단어 730) · 문법 72개
- `sw.js`, `manifest.webmanifest`, 아이콘: 홈 화면 앱(PWA)용
- `tools/`: 데이터 생성·검사 스크립트와 원본 예문(TSV)

## 예문 규칙
- 새 단어 예문은 기존 단어장 563개 + 그날까지 배운 새 단어만 사용 (`tools/check.py`, `tools/gcheck.py`로 단어 단위 검사)
- 가능하면 HSK 3급 문법 자료의 문형을 쓰고, 한 줄 문법 코멘트를 붙임
- 수정 후 `data.json`의 버전과 `sw.js`의 캐시 이름을 올려야 폰에 반영됨. 학습 기록(localStorage 키 `pcs-state-v1`)은 지우지 않음
