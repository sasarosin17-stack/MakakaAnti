package ru.gov.monitoring.orangutan

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.WallpaperManager
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.media.AudioManager
import android.os.*
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import kotlinx.coroutines.*
import java.net.URL
import kotlin.random.Random

class MainActivity : AppCompatActivity(), SensorEventListener {

    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private var stepCount = 0
    private var violationsCount = 0
    private var isTaskActive = false
    private lateinit var tvViolations: TextView
    private lateinit var tvStatus: TextView
    private val scope = CoroutineScope(Dispatchers.Main + Job())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // UI Initialization (Simplified for code purposes)
        tvViolations = findViewById(R.id.tvViolations)
        tvStatus = findViewById(R.id.tvStatus)

        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        requestPermissions()
        startViolationsCounter()
        startTasksLoop()
        
        // Initial Wallpaper set
        setOrangutanWallpaper()
    }

    private fun requestPermissions() {
        ActivityCompat.requestPermissions(this, arrayOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACTIVITY_RECOGNITION,
            Manifest.permission.SET_WALLPAPER
        ), 101)
    }

    private fun startViolationsCounter() {
        scope.launch {
            while (isActive) {
                delay(1500)
                violationsCount += Random.nextInt(1, 4)
                tvViolations.text = "НАРУШЕНИЙ: $violationsCount"
            }
        }
    }

    private fun startTasksLoop() {
        scope.launch {
            while (isActive) {
                delay(60000) // 60 seconds
                if (!isTaskActive) {
                    showRandomTask()
                }
            }
        }
    }

    private fun showRandomTask() {
        isTaskActive = true
        val tasks = listOf("Audio", "Photo", "Activity")
        val selected = tasks.random()
        
        maximizeVolume()
        vibrateSOS()

        when (selected) {
            "Audio" -> showTaskDialog("СРОЧНО ПРООРИТЕ КАК ОРАНГУТАНГ ДЛЯ АНАЛИЗА ГОЛОСА") { isTaskActive = false }
            "Photo" -> showTaskDialog("СДЕЛАЙТЕ СЕЛФИ С БАНАНОМ (ИЛИ ЛЮБЫМ ЖЕЛТЫМ ОБЪЕКТАМ)") { isTaskActive = false }
            "Activity" -> startStepTask()
        }
    }

    private fun showTaskDialog(message: String, onTaskComplete: () -> Unit) {
        AlertDialog.Builder(this)
            .setTitle("ДИРЕКТИВА №${Random.nextInt(100, 999)}")
            .setMessage(message)
            .setCancelable(false)
            .setPositiveButton("Я ВЫПОЛНИЛ") { dialog, _ ->
                dialog.dismiss()
                onTaskComplete()
            }
            .show()
    }

    private fun startStepTask() {
        stepCount = 0
        val dialog = AlertDialog.Builder(this)
            .setTitle("ДИРЕКТИВА №${Random.nextInt(100, 999)}")
            .setMessage("ДОКАЖИТЕ, ЧТО ВЫ ОРАНГУТАНГ — ПРОБЕГИТЕ 40 ШАГОВ\nШАГОВ: 0/40")
            .setCancelable(false)
            .create()

        sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_UI)
        
        dialog.show()

        // We update dialog text via a custom layout or just recreation
        // For simplicity, let's assume we handle it via the sensor listener
        this.currentStepDialog = dialog
    }

    private var currentStepDialog: AlertDialog? = null

    override fun onSensorChanged(event: SensorEvent?) {
        if (event?.sensor?.type == Sensor.TYPE_ACCELEROMETER) {
            val x = event.values[0]
            val y = event.values[1]
            val z = event.values[2]
            
            val acceleration = Math.sqrt((x*x + y*y + z*z).toDouble())
            if (acceleration > 15) { // Simple shake detection
                stepCount++
                currentStepDialog?.setMessage("ДОКАЖИТЕ, ЧТО ВЫ ОРАНГУТАНГ — ПРОБЕГИТЕ 40 ШАГОВ\nШАГОВ: $stepCount/40")
                
                if (stepCount >= 40) {
                    sensorManager.unregisterListener(this)
                    currentStepDialog?.dismiss()
                    isTaskActive = false
                }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun maximizeVolume() {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC), 0)
    }

    private fun vibrateSOS() {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            vibratorManager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        val pattern = longArrayOf(0, 100, 100, 100, 100, 100, 300, 300, 100, 300, 100, 300, 100, 100, 100, 100, 100, 100)
        vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
    }

    private fun setOrangutanWallpaper() {
        scope.launch(Dispatchers.IO) {
            val url = URL("https://upload.wikimedia.org/wikipedia/commons/7/78/Pongo_pygmaeus_%28orangutang%29.jpg")
            try {
                val input = url.openStream()
                val bitmap = BitmapFactory.decodeStream(input)
                val wallpaperManager = WallpaperManager.getInstance(applicationContext)
                wallpaperManager.setBitmap(bitmap)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    override fun onBackPressed() {
        // Кнопка назад заблокирована
        vibrateSOS()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
