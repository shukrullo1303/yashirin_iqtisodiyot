# Public-registration approval workflow.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0010_tracked_customer"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="is_approved",
            field=models.BooleanField(default=False, verbose_name="Tasdiqlangan"),
        ),
        # Existing accounts predate this workflow and must not be locked out
        # after a deployment.
        migrations.RunSQL(
            "UPDATE users SET is_approved = 1",
            "UPDATE users SET is_approved = 0",
        ),
    ]
