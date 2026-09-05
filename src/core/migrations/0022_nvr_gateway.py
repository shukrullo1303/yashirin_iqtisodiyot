from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [('core', '0021_governance')]
    operations = [migrations.CreateModel(name='NvrGateway', fields=[('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')), ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)), ('name', models.CharField(max_length=255)), ('host', models.CharField(help_text='VPN ichki IP yoki hostname', max_length=255)), ('channel_count', models.PositiveIntegerField(default=8)), ('vpn_connected', models.BooleanField(default=False)), ('status', models.CharField(choices=[('online', 'Online'), ('offline', 'Offline'), ('warning', 'Ogohlantirish')], default='offline', max_length=10)), ('last_heartbeat', models.DateTimeField(blank=True, null=True)), ('notes', models.TextField(blank=True, default='')), ('location', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='nvr_gateway', to='core.location'))], options={'db_table': 'nvr_gateways', 'ordering': ['location__name']})]
