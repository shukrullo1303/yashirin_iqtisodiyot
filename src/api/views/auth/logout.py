from src.api.views.base import *


class LogoutAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        logout(request)
        return Response({"message": "Muvaffaqiyatli chiqildi."}, status=status.HTTP_200_OK)

