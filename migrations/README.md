# migrations (blocpanel)

`001`–`004` — פונקציות שהפאנל קורא להן (סשנים, סטטוס חברה, ארכוב). מורצות ב-SQL Editor של אותו פרויקט Supabase.

מ-2026-09-27 מיגרציות שהפאנל תלוי בהן נמצאות בריפו של **bloc** (`supabase/migrations/`), כדי שיהיה רצף מספור אחד:

| מיגרציה (bloc) | מה הפאנל צריך ממנה |
|---|---|
| 119–121 | טריגרי חיוב; `_building_company_entitlement`, `_company_grant`; `billing_subscriptions`, `subscription_payments.owner_type` |
| 122 | מצבי תשלום (`pending_approval`, `external_pending`, `credited`…), `payment_external_refs` |
| 123 | `supplier_payments.confirmation_status` (מחלוקות) |
| 124 | `panel_*_view` סגורים ל-anon — הפאנל קורא עם service_role בלבד |
| 125 | `panel_security_health`, `panel_debt_by_building`, `panel_building_billing`, `panel_company_billing`; guard על `supplier_profiles` |

בלי 125 הפאנל עובד: חובות מחושבים מ-1000 שורות ומסומנים "חלקי", ומסכי המסלול/בריאות אבטחה מוסתרים.
