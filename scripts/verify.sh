#!/usr/bin/env bash
# scripts/verify.sh (blocpanel) — בדיקה מלאה לפני push. אותו דפוס כמו ב-bloc.
# הרצה:  bash scripts/verify.sh
#
# מריץ ברצף typecheck → טסטים → build. הרצה ברצף (ולא במקביל) נבחרה
# בכוונה: על טרמוקס, typecheck וטסטים במקביל חנקו את ה-CPU וגרמו
# ל-timeouts אקראיים בטסטי UI לא-קשורים (flake). ברצף זה קצת יותר
# איטי אבל יציב לחלוטין.
# יוצא עם קוד 1 אם משהו נכשל, כדי שאפשר יהיה לשרשר:  bash scripts/verify.sh && git push

set -uo pipefail
cd "$(dirname "$0")/.."

RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; RST=$'\e[0m'
mkdir -p .verify

# .next/dev/types/validator.ts הוא קובץ שנוצר אוטומטית ומכיל רשימת נתיבים
# מהריצה הקודמת של `next dev`. אם נתיב נמחק/לא קיים, הוא עדיין מופיע שם
# ומייצר TS2307 מזויפים שאין להם קשר לקוד. מוחקים לפני typecheck.
rm -rf .next/dev/types .next/types 2>/dev/null || true

# ── 1. typecheck ─────────────────────────────────────────────────────────────
echo "${YLW}▶ typecheck...${RST}"
if npx tsc --noEmit > .verify/tsc.log 2>&1; then
  echo "${GRN}✓ TypeScript נקי${RST}"
else
  echo "${RED}✗ TypeScript — שגיאות:${RST}"
  grep -E "error TS" .verify/tsc.log | head -20
  echo "  (מלא: .verify/tsc.log)"
  echo "${RED}עצירה — תקן לפני המשך.${RST}"
  exit 1
fi

# ── 2. טסטים ─────────────────────────────────────────────────────────────────
echo "${YLW}▶ טסטים...${RST}"
if npx vitest run --reporter=basic > .verify/test.log 2>&1; then
  echo "${GRN}✓ טסטים עברו — $(grep -oE '[0-9]+ passed' .verify/test.log | tail -1)${RST}"
else
  echo "${RED}✗ טסטים נכשלו:${RST}"
  grep -E "FAIL|✗|×" .verify/test.log | head -20
  echo "  (מלא: .verify/test.log)"
  echo "${RED}עצירה — תקן לפני build.${RST}"
  exit 1
fi

# ── 3. build ─────────────────────────────────────────────────────────────────
echo "${YLW}▶ build...${RST}"
if npm run build > .verify/build.log 2>&1; then
  echo "${GRN}✓ build עבר${RST}"
  grep -E "First Load JS|Route \(app\)" .verify/build.log | head -5
  echo
  echo "${GRN}הכל ירוק — מוכן ל-push.${RST}"
else
  echo "${RED}✗ build נכשל:${RST}"
  tail -30 .verify/build.log
  exit 1
fi
