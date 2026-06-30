# Shedflare Routines Architecture

## Overview

Routine tracker app built with SolidJS, Cloudflare Workers, and D1 database. Focuses on daily routine management with visual progress tracking and historical analytics.

## Key Components

### Frontend

- **DayView**: Shows current day/time with countdown to sleep time
- **ProgressBar**: Visual indicator of time needed for incomplete routines vs time available
- **RoutinesList**: Editable list of daily routines with checkbox completion
- **RoutineItem**: Individual routine with inline edit mode
- **AddRoutine**: Modal form to create new routines
- **Analytics**: Weekly/monthly/yearly charts showing completion rates

### Backend API Endpoints

- `GET /api/routines/user` - Get current user email
- `GET /api/routines/day` - Get today's routines and completions
- `POST /api/routines` - Create routine
- `PUT /api/routines/:id` - Update routine
- `DELETE /api/routines/:id` - Delete routine
- `POST /api/routines/completion` - Toggle completion for routine on date
- `POST /api/routines/reorder` - Reorder routines by ID list
- `GET /api/routines/analytics/week|month|year` - Get completion stats
- `GET/POST /api/routines/settings/sleep-time` - Manage sleep time setting

### Database Schema

- **routines**: Core routine data (name, scheduled time, duration)
- **routine_completions**: Daily completion records (routine_id, date, completed flag)
- **settings**: Key-value settings (sleep_time)

## Development

Uses Vite+ unified toolchain. Standard commands:

```bash
vp dev       # Start dev server
vp build     # Build for production
vp check     # Format, lint, typecheck
vp test      # Run tests
```

## Notes

- Sleep time is configurable per user via settings
- Progress bar shows how many hours of routines are left vs total time until sleep
- Analytics aggregate completion data by day/month/year
- Uses crypto.getRandomValues for UUID generation in Cloudflare Workers
