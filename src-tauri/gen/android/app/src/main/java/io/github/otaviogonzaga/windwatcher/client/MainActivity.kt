package io.github.otaviogonzaga.windwatcher.client

import android.graphics.Color
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.graphics.Insets
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.ViewCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge(
      // Keep light system icons legible regardless of the in-memory web theme.
      statusBarStyle = SystemBarStyle.dark(Color.rgb(29, 32, 33)),
      navigationBarStyle = SystemBarStyle.dark(Color.rgb(29, 32, 33)),
    )
    super.onCreate(savedInstanceState)
    // M134 does not forward safe-area CSS insets. Give the WebView a safe native
    // rectangle on every version, then zero only the insets already handled here.
    // M134 also leaves the visual viewport unchanged behind the IME. Resize the
    // same content rectangle for IME and forward zeroed handled types, not a
    // consumed object; this avoids double resizing on newer WebViews.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val types = WindowInsetsCompat.Type.systemBars() or
        WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
      val safe = insets.getInsets(types)
      view.setPadding(safe.left, safe.top, safe.right, safe.bottom)
      WindowInsetsCompat.Builder(insets).setInsets(types, Insets.NONE).build()
    }
    ViewCompat.requestApplyInsets(content)
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = false
      isAppearanceLightNavigationBars = false
    }
    // API 35+ enforces transparent bars. Paint only their inset regions, rather
    // than coupling system icon contrast to the web app's independent theme.
    val protection = object : View(this) {
      private var bars = Insets.NONE
      private val paint = Paint().apply { color = Color.rgb(29, 32, 33) }

      override fun onApplyWindowInsets(insets: WindowInsets): WindowInsets {
        bars = WindowInsetsCompat.toWindowInsetsCompat(insets, this)
          .getInsets(WindowInsetsCompat.Type.systemBars())
        invalidate()
        return insets
      }

      override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        canvas.drawRect(0f, 0f, w, bars.top.toFloat(), paint)
        canvas.drawRect(0f, h - bars.bottom, w, h, paint)
        canvas.drawRect(0f, 0f, bars.left.toFloat(), h, paint)
        canvas.drawRect(w - bars.right, 0f, w, h, paint)
      }
    }.apply {
      importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
      isClickable = false
      isFocusable = false
    }
    (window.decorView as ViewGroup).addView(protection, ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT,
    ))
    protection.requestApplyInsets()
  }
}
