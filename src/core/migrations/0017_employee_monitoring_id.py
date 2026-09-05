from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0016_visitorevent")]

    operations = [
        migrations.AddField(
            model_name="employee",
            name="monitoring_id",
            field=models.CharField(blank=True, max_length=20, null=True, unique=True, verbose_name="Doimiy kamera ID"),
        ),
    ]
