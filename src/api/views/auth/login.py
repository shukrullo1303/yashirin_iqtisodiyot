from src.api.views.base import *    




class LoginAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        user = serializer.validated_data["user"]
        login(request, user)

        return Response(
            {
                "message": "Muvaffaqiyatli kirildi.",
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )

