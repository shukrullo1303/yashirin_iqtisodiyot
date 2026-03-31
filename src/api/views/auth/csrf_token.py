from src.api.views.base import *

@method_decorator(ensure_csrf_cookie, name="dispatch")
class CSRFTokenAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, *args, **kwargs):
        return Response({"detail": "CSRF cookie set."}, status=status.HTTP_200_OK)

