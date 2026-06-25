from backend.json_validator import JSONValidator, PluginResponseValidator

def test_valid_response():
    validator = JSONValidator("plugin_response")
    data = {
        "status": "success",
        "data": {"result": "ok", "confidence": 0.9},
        "timestamp": "2024-01-01T00:00:00Z"
    }
    is_valid, error, _ = validator.validate(data)
    assert is_valid is True
    assert error is None

def test_invalid_status():
    validator = JSONValidator("plugin_response")
    data = {"status": "unknown"}
    is_valid, error, _ = validator.validate(data)
    assert is_valid is False
    assert "unknown" in error

def test_missing_required_field():
    validator = JSONValidator("plugin_response")
    data = {"extra_field": "value"}
    is_valid, error, _ = validator.validate(data)
    assert is_valid is False

def test_confidence_range():
    validator = JSONValidator("plugin_response")
    data = {
        "status": "success",
        "data": {"confidence": 1.5}
    }
    is_valid, error, _ = validator.validate(data)
    assert is_valid is False

def test_plugin_validator():
    valid = {"status": "success", "data": {"result": "ok"}}
    result = PluginResponseValidator.validate_response(valid)
    assert result["status"] == "success"
    
    invalid = {"wrong": "field"}
    result = PluginResponseValidator.validate_response(invalid)
    assert result["status"] == "error"

def test_is_valid_response():
    valid = {"status": "success"}
    assert PluginResponseValidator.is_valid_response(valid) is True
    
    invalid = {"wrong": "field"}
    assert PluginResponseValidator.is_valid_response(invalid) is False

def test_extract_data():
    response = {
        "status": "success",
        "data": {"result": "test_value"}
    }
    value = PluginResponseValidator.extract_data(response, "result")
    assert value == "test_value"
    
    value = PluginResponseValidator.extract_data(response, "missing", "default")
    assert value == "default"