from src.agent.prompts import build_system_prompt, build_caller_context_suffix


def test_system_prompt_includes_booking_by_default():
    config = {"business_name": "Test Dental"}
    prompt = build_system_prompt(config)
    assert "appointment" in prompt.lower() or "book" in prompt.lower()


def test_system_prompt_excludes_booking_when_disabled():
    config = {"business_name": "Test Info Line", "can_book_appointments": False}
    prompt = build_system_prompt(config)
    assert "book an appointment" not in prompt.lower()
    assert "check_availability" not in prompt.lower()


def test_system_prompt_includes_booking_when_enabled():
    config = {"business_name": "Test Dental", "can_book_appointments": True}
    prompt = build_system_prompt(config)
    assert "appointment" in prompt.lower() or "book" in prompt.lower()


def test_caller_context_with_upcoming_appointments():
    contact = {"name": "Sarah", "callCount": 3}
    appointments = {
        "upcoming": [
            {"service": "Teeth Cleaning", "scheduledAt": "2026-03-25T15:00:00Z", "status": "BOOKED"}
        ],
        "past": [],
    }
    result = build_caller_context_suffix(contact, appointments)
    assert "upcoming" in result.lower() or "Teeth Cleaning" in result


def test_caller_context_with_past_only():
    contact = {"name": "Sarah", "callCount": 3}
    appointments = {
        "upcoming": [],
        "past": [
            {"service": "X-Ray", "scheduledAt": "2026-01-10T14:00:00Z", "status": "COMPLETED"}
        ],
    }
    result = build_caller_context_suffix(contact, appointments)
    assert "last visit" in result.lower() or "X-Ray" in result


def test_caller_context_with_no_appointments():
    contact = None
    appointments = {"upcoming": [], "past": []}
    result = build_caller_context_suffix(contact, appointments)
    assert result == "" or result.strip() == ""
