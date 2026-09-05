from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("core", "0018_visitorretentionsetting")]

    operations = [
        migrations.AddField(
            model_name="user",
            name="assigned_locations",
            field=models.ManyToManyField(blank=True, related_name="assigned_inspectors", to="core.location", verbose_name="Biriktirilgan tekshiruv lokatsiyalari"),
        ),
    ]
