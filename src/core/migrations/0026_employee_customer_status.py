from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0025_visitorsession_body_images')]
    operations = [migrations.AlterField(
        model_name='employee', name='status',
        field=models.CharField(max_length=20, default='active', verbose_name='Статус', choices=[
            ('active', 'Faol'), ('fired', 'Ishdan bo‘shatilgan'),
            ('candidate_by_ai', 'AI tomonidan nomzod'), ('customer', 'Mijozga qaytarilgan'),
        ]),
    )]
