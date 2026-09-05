from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0017_employee_monitoring_id")]

    operations = [
        migrations.CreateModel(
            name="VisitorRetentionSetting",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("retention_hours", models.PositiveIntegerField(default=24)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={"db_table": "visitor_retention_settings"},
        ),
    ]
