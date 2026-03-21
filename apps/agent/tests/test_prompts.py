from src.agent.prompts import build_system_prompt, build_caller_context_suffix


def test_system_prompt_includes_booking_by_default():
    config = {"business_name": "Test Clinic"}
    prompt = build_system_prompt(config)
    assert "appointment" in prompt.lower() or "book" in prompt.lower()


def test_system_prompt_excludes_booking_when_disabled():
    config = {"business_name": "Test Info Line", "can_book_appointments": False}
    prompt = build_system_prompt(config)
    assert "book an appointment" not in prompt.lower()
    assert "check_availability" not in prompt.lower()


def test_system_prompt_includes_booking_when_enabled():
    config = {"business_name": "Test Clinic", "can_book_appointments": True}
    prompt = build_system_prompt(config)
    assert "appointment" in prompt.lower() or "book" in prompt.lower()


def test_system_prompt_contains_caller_identification():
    prompt = build_system_prompt({})
    assert "caller identification" in prompt.lower()
    assert "name" in prompt.lower()


def test_system_prompt_contains_conversation_flow():
    prompt = build_system_prompt({})
    assert "conversation flow" in prompt.lower()
    assert "greet the caller" in prompt.lower()


def test_system_prompt_contains_common_scenarios():
    prompt = build_system_prompt({})
    assert "common scenarios" in prompt.lower()
    assert "cancelling or rescheduling" in prompt.lower()
    assert "leaving a message" in prompt.lower()
    assert "callback requests" in prompt.lower()
    assert "after-hours" in prompt.lower()
    assert "wrong number" in prompt.lower()


def test_reschedule_addendum_when_booking_enabled():
    config = {"can_book_appointments": True}
    prompt = build_system_prompt(config)
    assert "help reschedule directly" in prompt.lower()


def test_no_reschedule_addendum_when_booking_disabled():
    config = {"can_book_appointments": False}
    prompt = build_system_prompt(config)
    assert "help reschedule directly" not in prompt.lower()


def test_no_dental_specific_language_in_default_prompt():
    prompt = build_system_prompt({})
    assert "dental receptionist" not in prompt.lower()
    assert "dental emergency" not in prompt.lower()
    assert "dental clinic" not in prompt.lower()


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
