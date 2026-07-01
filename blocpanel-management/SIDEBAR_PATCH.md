# Sidebar.tsx — שני שינויים ידניים

## שינוי 1 — הוסף Briefcase לimport (שורה 3):
```
import {
  LayoutDashboard, Building2, Users, CreditCard, Wrench,
  ScrollText, Settings, LogOut, BarChart3, X, Send, Search, Archive, TrendingDown, ShieldCheck, Radio, Briefcase,
} from "lucide-react";
```

## שינוי 2 — הוסף לרשימת NAV אחרי /security:
```
  { href:"/security",  label:"אבטחה",         icon:ShieldCheck },
  { href:"/management-companies", label:"חברות ניהול", icon:Briefcase },
```
