from rest_framework.views import APIView
from rest_framework.response import Response
from src.core.services.video_analytics_service import VideoAnalyticsService

class AnalyzeVideoView(APIView):
    def post(self, request):
        # Kameradan yoki fayldan kelayotgan ma'lumot
        video_source = request.data.get('source') 
        
        # Servisni ishga tushiramiz
        analytics = VideoAnalyticsService()
        result = analytics.process_stream(video_source)
        
        return Response({"status": "success", "data": result})