
from src.api.views.base import *    



class RegisterAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "message": "Arizangiz yuborildi. Superadmin tasdiqlagach tizimga kira olasiz.",
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )
