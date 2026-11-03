# CareLoop — Visual Design System & Philosophy (design.md)

This document articulates the visual design system, design philosophy, and interaction architecture for CareLoop, synthesizing the design discipline of leading modern healthcare technology products (inspired by MyHealthPrac).

---

## 1. Core Design Philosophy

CareLoop is an emergency blood coordination infrastructure platform. In emergency situations, users experience elevated stress, urgency, and cognitive load. The design language must therefore radiate:

1. **Calm Authority**: Muted neutral backgrounds (`#F8F9F8`), crisp white surfaces (`#FFFFFF`), and refined typography create an atmosphere of clinical stability.
2. **Restrained Emergency Signaling**: Red is an emergency accent (`#C62828`), never a decorative backdrop. Ordinary buttons, cards, and headers never use emergency red.
3. **Information Density with Breathing Room**: Generous whitespace, 4px-grid alignment, and structured data hierarchy prevent claustrophobia while ensuring critical clinical metrics (blood group, component, units, hospital) are instantly parsed.
4. **Honest, Verifiable States**: The interface never displays fake live activity, simulated deliveries, or unconfirmed matches. Every badge, delivery tick, and stock number represents authentic, verifiable clinical data.
5. **Human-Centered Empathy**: Technology serves patients, donors, coordinators, and medical technicians. Visual storytelling connects logistics with real human lives.

---

## 2. Centralized Design Tokens

### Color Balance & Semantic Hierarchy

| Token | CSS Variable / Value | Purpose & Clinical Meaning |
|---|---|---|
| `color-brand` | `#B42332` | Primary CareLoop brand anchor. Used for primary CTAs and active states. |
| `color-brand-dark` | `#8F1928` | Hover/pressed brand states, deep header contrast. |
| `color-emergency` | `#C62828` | Strictly isolated to critical emergency alerts and high-triage escalations. |
| `color-success` | `#16845B` | Verified laboratory stock, fulfilled requests, validated donors. |
| `color-warning` | `#C58A24` | Deficit/shortage alerts, pending responses, expiring units. |
| `color-info` | `#3478B8` | Clinical guidance, system informational telemetry. |
| `color-text-primary` | `#202322` | High-contrast readable typography (WCAG AAA contrast against `#F8F9F8`). |
| `color-text-secondary` | `#69716F` | Metadata, secondary labels, helper descriptions. |
| `color-background` | `#F8F9F8` | Main application background (neutral off-white). |
| `color-surface` | `#FFFFFF` | Cards, panels, modal sheets, and dropdowns. |
| `color-border` | `#E6E9E7` | Subtle hairlines and structural dividers. |
| `color-muted` | `#F0F2F0` | Hover states, pill backgrounds, inactive slots. |

---

## 3. Typography Hierarchy

A two-font complementary typography system:
- **Primary Body & UI**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, sans-serif.
- **Display & Headings**: `Plus Jakarta Sans` or high-grade editorial sans-serif with optical kerning and tight tracking.

### Type Scale
- **Display**: `56px–64px` (`text-display`, tracking `-0.025em`, font-weight 800)
- **H1**: `40px–48px` (`text-h1`, tracking `-0.02em`, font-weight 700)
- **H2**: `30px–36px` (`text-h2`, tracking `-0.015em`, font-weight 700)
- **H3**: `22px–26px` (`text-h3`, tracking `-0.01em`, font-weight 600)
- **H4**: `18px–20px` (`text-h4`, font-weight 600)
- **Body**: `15px–16px` (`text-body`, line-height 1.55, font-weight 400/500)
- **Secondary**: `13px–14px` (`text-secondary`, line-height 1.45, font-weight 400/500)
- **Caption**: `12px` (`text-caption`, line-height 1.4, font-weight 500/600)

**Typography Rules**:
- Never accent a single arbitrary word in a headline with glowing gradients.
- Keep line lengths under 75 characters for optimal readability during stress.
- Restrict uppercase tracking exclusively to small badges and category eyebrows.

---

## 4. Spacing, Shapes, and Elevation

### 4px Spacing Grid
Defined tokens: `4px`, `8px`, `12px`, `16px`, `20px`, `24px`, `32px`, `40px`, `48px`, `64px`, `80px`, `96px`.

### Restrained Geometry
- `rounded-xs`: `4px` (tags, small status chips)
- `rounded-sm`: `4px` (inputs, compact controls)
- `rounded`: `8px` (default buttons, form fields, table cards)
- `rounded-lg`: `12px` (feature panels, secondary cards)
- `rounded-xl`: `16px` (hero containers, modal dialogs)
- `rounded-full`: `999px` (avatars, circular indicators)

*Rule*: Avoid making every element an exaggerated pill. Clean, disciplined corners signal institutional trust.

### Elevation & Lighting
- Default to **1px solid border (`#E6E9E7`)** over heavy drop shadows.
- Ambient card shadow: `0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)`.
- Modal elevation: `0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.05)`.

---

## 5. Animation & Motion Philosophy

Motion is the connective tissue of the application:
1. **Micro-interactions**: `120ms–180ms` (button taps, chip toggles, focus rings).
2. **Component transitions**: `200ms–280ms` (accordion expansions, modal entrances).
3. **Section reveals**: `300ms–400ms` (staggered scroll entrances, connecting timeline progress).
4. **Safety boundary**: Never animate during emergency submission; never introduce motion that delays an attendant's ability to tap a contact button or submit a blood request.
5. **Accessibility**: Fully respect `prefers-reduced-motion: reduce`.

---

## 6. Image Treatment & Visual Assets

- **Authentic Healthcare Photography**: Realistic clinical environments, transfusion medicine laboratories, blood donation mobile vans, certified phlebotomists, and genuine donor interactions.
- **Desaturated Warmth**: Avoid over-saturated stock photography. Apply subtle color grading that blends naturally with `#F8F9F8` and `#B42332`.
- **Atmospheric Depth**: Crisp SVG hairline diagrams and SVG status connectors rather than noisy 3D cartoons.

---

## 7. Seven-Chapter Scroll-Based Narrative (Landing Page)

1. **Chapter 1 — Hero Entry**: Immediate clarity of purpose: CareLoop connects patients with donors, hospitals, and coordinators. Smooth orchestrated reveal of logo, title, supporting copy, primary CTA, and hero visual.
2. **Chapter 2 — The Problem**: Visual transition illuminating the friction, panic, and communication breakdown of finding blood during critical hospital emergencies.
3. **Chapter 3 — How CareLoop Works**: 7-step visual workflow (01 Create request → 02 Find donors → 03 Notify → 04 Receive responses → 05 Confirm assignment → 06 Coordinate communication → 07 Complete request).
4. **Chapter 4 — Intelligent Coordination**: Antigen compatibility matrix, proximity matching, donor availability, and request triage visualization (with clear medical disclaimers).
5. **Chapter 5 — Communication Ecosystem**: Central emergency request connected with 4 authenticated roles (Patient ↔ Coordinator ↔ Assigned Donor ↔ Blood Centre).
6. **Chapter 6 — Clinical Reliability**: Fallback mechanisms: donor decline handling, escalation radius expansion, coordinator intervention, and low-connectivity draft recovery.
7. **Chapter 7 — Unified Entry Points**: Emotionally grounded call to action with clear role-specific portals (Request Blood, Volunteer as Donor, Accredited Blood Centre).

