package com.maystroon.reader.core

import com.maystroon.reader.BuildConfig
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

interface PublicApi {
    @GET("api/v1/posts") suspend fun posts(
        @Query("page") page: Int = 1,
        @Query("pageSize") size: Int = 20,
        @Query("category") category: String? = null,
        @Query("q") query: String? = null,
        @Query("author") author: String? = null,
    ): PostPage
    @GET("api/v1/posts/{slug}") suspend fun post(@Path("slug") slug: String): Envelope<Post?>
    @GET("api/v1/categories") suspend fun categories(): Envelope<List<Category>>
    @GET("api/v1/authors") suspend fun authors(): Envelope<List<Author>>
    @GET("api/v1/authors/{slug}") suspend fun author(@Path("slug") slug: String): Envelope<Author?>
}

object ApiFactory {
    val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }
    fun create(baseUrl: String = BuildConfig.API_BASE_URL): PublicApi {
        require(baseUrl.startsWith("https://") || baseUrl.startsWith("http://localhost:"))
        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS).readTimeout(25, TimeUnit.SECONDS)
            .callTimeout(35, TimeUnit.SECONDS)
            // Public reader: no credentials, fabricated Origin, logging interceptor or TLS bypass.
            .addInterceptor { chain -> chain.proceed(chain.request().newBuilder().header("Accept", "application/json").build()) }
            .build()
        return Retrofit.Builder().baseUrl(baseUrl).client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build().create(PublicApi::class.java)
    }
}
