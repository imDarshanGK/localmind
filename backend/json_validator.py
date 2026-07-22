"""
JSON Schema Validator for Plugin Responses
Provides safe validation of plugin output against predefined schemas.
"""

import json
from jsonschema import validate, ValidationError, SchemaError
from typing import Dict, Any, Optional

# Predefined schemas for different plugin types
PLUGIN_SCHEMAS = {
    "plugin_response": {
        "type": "object",
        "properties": {
            "status": {
                "type": "string",
                "enum": ["success", "error", "partial"]
            },
            "data": {
                "type": "object",
                "properties": {
                    "result": {"type": "string"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "metadata": {"type": "object"}
                },
                "additionalProperties": True
            },
            "error": {
                "type": "object",
                "properties": {
                    "code": {"type": "string"},
                    "message": {"type": "string"}
                },
                "required": ["code", "message"]
            },
            "timestamp": {"type": "string", "format": "date-time"}
        },
        "required": ["status"],
        "additionalProperties": False
    },
    
    "batch_response": {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {"$ref": "#/definitions/plugin_response"}
            },
            "total": {"type": "integer", "minimum": 0},
            "page": {"type": "integer", "minimum": 1}
        },
        "required": ["items", "total"]
    },
    
    "health_check": {
        "type": "object",
        "properties": {
            "status": {"type": "string", "enum": ["healthy", "degraded", "unhealthy"]},
            "version": {"type": "string"},
            "uptime": {"type": "number"},
            "dependencies": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "status": {"type": "string", "enum": ["up", "down"]}
                    }
                }
            }
        },
        "required": ["status"]
    }
}

# Add definitions for recursive references
PLUGIN_SCHEMAS["definitions"] = {
    "plugin_response": PLUGIN_SCHEMAS["plugin_response"]
}


class JSONValidator:
    """Safe JSON schema validator for plugin responses."""
    
    def __init__(self, schema_name: str = "plugin_response"):
        """Initialize validator with a specific schema."""
        self.schema_name = schema_name
        self.schema = PLUGIN_SCHEMAS.get(schema_name, PLUGIN_SCHEMAS["plugin_response"])
    
    def validate(self, data: Any) -> tuple[bool, Optional[str], Optional[Dict]]:
        """
        Validate JSON data against the schema.
        
        Returns:
            tuple: (is_valid, error_message, validated_data)
        """
        try:
            # If data is string, parse it as JSON first
            if isinstance(data, str):
                data = json.loads(data)
            
            validate(instance=data, schema=self.schema)
            return True, None, data
            
        except json.JSONDecodeError as e:
            return False, f"Invalid JSON: {str(e)}", None
        except ValidationError as e:
            return False, f"Schema validation failed: {e.message}", None
        except SchemaError as e:
            return False, f"Invalid schema: {str(e)}", None
    
    def safe_validate(self, data: Any, default: Optional[Dict] = None) -> Dict:
        """
        Validate with safe fallback - returns validated data or default.
        """
        is_valid, error, validated = self.validate(data)
        if is_valid and validated:
            return validated
        return default or {"status": "error", "error": {"code": "VALIDATION_FAILED", "message": error}}


class PluginResponseValidator:
    """Convenience class for validating plugin responses."""
    
    @staticmethod
    def validate_response(response: Dict) -> Dict:
        """Validate a plugin response and return sanitized version."""
        validator = JSONValidator("plugin_response")
        is_valid, error, validated = validator.validate(response)
        
        if not is_valid:
            return {
                "status": "error",
                "error": {
                    "code": "INVALID_RESPONSE",
                    "message": f"Response validation failed: {error}"
                },
                "original": response if response else None
            }
        return validated
    
    @staticmethod
    def is_valid_response(response: Dict) -> bool:
        """Quick check if response is valid."""
        validator = JSONValidator("plugin_response")
        is_valid, _, _ = validator.validate(response)
        return is_valid
    
    @staticmethod
    def extract_data(response: Dict, key: str, default=None):
        """Safely extract data from validated response."""
        if not PluginResponseValidator.is_valid_response(response):
            return default
        return response.get("data", {}).get(key, default)


def validate_json_file(filepath: str, schema_name: str = "plugin_response") -> bool:
    """Validate a JSON file against a schema."""
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        validator = JSONValidator(schema_name)
        is_valid, error, _ = validator.validate(data)
        if not is_valid:
            print(f"Validation failed for {filepath}: {error}")
        return is_valid
    except Exception as e:
        print(f"Error reading/validating {filepath}: {e}")
        return False


# Example usage
if __name__ == "__main__":
    # Test valid response
    valid_response = {
        "status": "success",
        "data": {
            "result": "Plugin executed successfully",
            "confidence": 0.95,
            "metadata": {"execution_time": 0.5}
        },
        "timestamp": "2024-01-01T00:00:00Z"
    }
    
    validator = JSONValidator("plugin_response")
    is_valid, error, validated = validator.validate(valid_response)
    print(f"Valid response test: {is_valid}")
    
    # Test invalid response
    invalid_response = {
        "status": "invalid_status",
        "wrong_field": "value"
    }
    
    is_valid, error, validated = validator.validate(invalid_response)
    print(f"Invalid response test: {is_valid}")
    if error:
        print(f"Error: {error}")