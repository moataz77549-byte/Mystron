package com.maystroon.reader

import android.app.Application
import androidx.room.Room
import com.maystroon.reader.core.ApiFactory
import com.maystroon.reader.core.ReaderDatabase
import com.maystroon.reader.core.ReaderPreferences

class MaystroonApplication : Application() {
    val api by lazy { ApiFactory.create() }
    val database by lazy { Room.databaseBuilder(this, ReaderDatabase::class.java, "reader.db").build() }
    val preferences by lazy { ReaderPreferences(this) }
}
