# Generated manually for the tax-inspector revenue entry workflow.
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0019_user_assigned_locations"),
    ]

    operations = [
        migrations.AddField(
            model_name="taxintegration",
            name="entered_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="entered_tax_reports", to=settings.AUTH_USER_MODEL, verbose_name="Kiritgan inspektor"),
        ),
        migrations.AddField(
            model_name="taxintegration",
            name="is_manual",
            field=models.BooleanField(default=False, verbose_name="Qo'lda kiritilgan"),
        ),
        migrations.AddField(
            model_name="taxintegration",
            name="report_period",
            field=models.DateField(blank=True, db_index=True, null=True, verbose_name="Hisobot sanasi"),
        ),
        migrations.AddField(
            model_name="taxintegration",
            name="report_period_type",
            field=models.CharField(choices=[("daily", "Kunlik"), ("monthly", "Oylik")], default="daily", max_length=10, verbose_name="Hisobot davri"),
        ),
    ]
