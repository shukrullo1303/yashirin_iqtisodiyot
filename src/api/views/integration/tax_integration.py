from src.api.views.base import *    


class TaxIntegrationViewSet(BaseModelViewSet):
    serializer_class = TaxIntegrationSerializer

    def get_queryset(self):
        queryset = models.TaxIntegration.objects.select_related("location").all().order_by("-id")
        location_id = self.request.query_params.get("location_id")
        if location_id:
            queryset = queryset.filter(location_id=location_id)
        return queryset

    @action(detail=False, methods=['post'], url_path='check-registration')
    def check_registration(self, request):
        """Локациянинг солиқда рўйхатдан ўтганлигини текширади"""
        location_id = request.data.get('location_id')
        if not location_id:
            return Response({'error': 'location_id kerak'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            location = models.Location.objects.get(id=location_id)
        except models.Location.DoesNotExist:
            return Response({'error': 'Локация топилмади'}, status=status.HTTP_404_NOT_FOUND)
        
        if not location.tax_id:
            return Response({'error': 'Локацияда STIR (ИНН) мавжуд эмас'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Солиқ хизмати билан интеграция (mock)
        # Аслда бу ерда солиқ хизмати API га мурожаат қилиш керак
        # tax_service_response = call_tax_api(location.tax_id)
        
        # Mock текширув: агар tax_id мавжуд бўлса ва локация тури 'cafe' ёки 'restaurant' бўлса, рўйхатдан ўтган деб ҳисоблаймиз
        # Ишлаш жойи мос келишини текширамиз (масалан, ном ва манзил)
        is_registered = self._check_workplace_match(location)
        
        # Локацияни янгилаймиз
        location.is_registered = is_registered
        location.save()
        
        return Response({
            'location_id': location_id,
            'is_registered': is_registered,
            'message': 'Рўйхатдан ўтган' if is_registered else 'Рўйхатдан ўтмаган'
        })

    def _check_workplace_match(self, location):
        """Ишлаш жойини солиқ маълумотлари билан солиштиради (mock)"""
        # Аслда бу ерда солиқ API дан маълумот олинади ва локация билан солиштирилади
        # Масалан: tax_data = get_tax_data(location.tax_id)
        # return tax_data['name'] == location.name and tax_data['address'] == location.address
        
        # Mock: агар tax_id мавжуд бўлса ва локация номида 'test' йўқ бўлса, рўйхатдан ўтган деб ҳисоблаймиз
        # Бундан ташқари, реал лойиҳада солиқ хизмати билан интеграция қилиш керак
        return bool(location.tax_id and 'test' not in location.name.lower())
