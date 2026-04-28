"""Service package exports.

Keep this module import-safe by avoiding eager imports of optional AI dependencies
such as `face_recognition`, `onnxruntime`, and `onvif`. Import concrete
services from their module paths instead, for example:

    from src.core.services.ai_service import AIService
"""

__all__ = [
    "AIService",
    "FaceRecognitionService",
    "PersonDetectionService",
    "BehavioralAnalyticsService",
    "PredictiveAnalyticsService",
    "RiskScoringService",
    "VideoAnalyticsService",
    "CameraService",
    "IntegrationService",
    "FaceDetectionVisualizationService",
]