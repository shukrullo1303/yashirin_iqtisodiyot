from django.db import migrations, models


def move_internal_cameras_to_entrance(apps, schema_editor):
    Camera = apps.get_model("core", "Camera")
    Camera.objects.filter(camera_type="internal").update(camera_type="entrance")


class Migration(migrations.Migration):
    dependencies = [("core", "0013_visitorsession_employee_visitorsession_is_employee")]

    operations = [
        migrations.RunPython(move_internal_cameras_to_entrance, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="camera",
            name="camera_type",
            field=models.CharField(
                choices=[("entrance", "Kirish"), ("exit", "Chiqish")],
                default="entrance", max_length=50, verbose_name="Kamera turi",
            ),
        ),
    ]
