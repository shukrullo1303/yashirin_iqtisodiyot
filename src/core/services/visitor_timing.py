from datetime import datetime, time, timedelta

from django.db.models import Q
from django.utils import timezone


def day_bounds(now=None):
    now = now or timezone.now()
    day = timezone.localtime(now).date()
    return (timezone.make_aware(datetime.combine(day, time.min)),
            timezone.make_aware(datetime.combine(day + timedelta(days=1), time.min)))


def todays_sessions(queryset, now=None):
    start, end = day_bounds(now)
    return queryset.filter(
        Q(entered_at__gte=start, entered_at__lt=end)
        | Q(events__occurred_at__gte=start, events__occurred_at__lt=end)
        | Q(entered_at__lt=start, exited_at__gt=start)
    ).distinct()


def visit_timing(session, now=None):
    """Sum entry/exit intervals; duplicate entry sightings never double time."""
    now = now or timezone.now()
    start, end = day_bounds(now)
    events = sorted(session.events.all(), key=lambda row: (row.occurred_at, row.pk))
    intervals = []
    opened = None
    for event in events:
        if event.occurred_at > now:
            continue
        if event.event_type == 'entry' and opened is None:
            opened = event.occurred_at
        elif event.event_type == 'exit' and opened is not None:
            intervals.append((opened, event.occurred_at))
            opened = None
    if not events:
        opened = session.entered_at
    current_entry = opened if session.status == 'inside' else None
    if opened is not None:
        intervals.append((opened, now if session.status == 'inside' else (session.exited_at or session.last_seen_at)))
    total = sum(max(0, (min(exit_at, now) - entry_at).total_seconds()) for entry_at, exit_at in intervals)
    today = sum(max(0, (min(exit_at, end, now) - max(entry_at, start)).total_seconds()) for entry_at, exit_at in intervals)
    return {
        'total_minutes': round(total / 60, 2),
        'today_minutes': round(today / 60, 2),
        'current_minutes': round(max(0, (now - current_entry).total_seconds()) / 60, 2) if current_entry else 0,
        'current_entry': current_entry,
    }
