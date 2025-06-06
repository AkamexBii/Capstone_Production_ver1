﻿using Azure.Core;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Security.Claims;
using System.Text;
using ToySharingAPI.Data;
using ToySharingAPI.DTO.MoMo;
using ToySharingAPI.Hubs;
using ToySharingAPI.Models;
using ToySharingAPI.Repositories;
using ToySharingAPI.Service;
using ToySharingAPI.Services;

var builder = WebApplication.CreateBuilder(args);
//builder.Environment.EnvironmentName = "Production";

// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo { Title = "Toyshare API", Version = "v1" });
    options.AddSecurityDefinition(JwtBearerDefaults.AuthenticationScheme, new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = JwtBearerDefaults.AuthenticationScheme
    });

    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = JwtBearerDefaults.AuthenticationScheme
                },
                Scheme = "Oauth2",
                Name = JwtBearerDefaults.AuthenticationScheme,
                In = ParameterLocation.Header
            },
            new List<string>()
        }
    });
});


builder.Services.AddDbContext<ToySharingVer3Context>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("MyCnn")));
builder.Services.AddDbContext<ToyshareAuthDbContext>(options =>
options.UseSqlServer(builder.Configuration.GetConnectionString("ToySharingAuthConnectionString")));

builder.Services.AddScoped<ITokenRepository, TokenRepository>();
builder.Services.AddScoped<IEmailService, EmailService>();


builder.Services.AddIdentityCore<IdentityUser>()
    .AddRoles<IdentityRole>()
    .AddTokenProvider<DataProtectorTokenProvider<IdentityUser>>("Toyshare")
    .AddEntityFrameworkStores<ToyshareAuthDbContext>()
.AddDefaultTokenProviders();

builder.Services.Configure<IdentityOptions>(options =>
{
    options.Password.RequireDigit = false;
    options.Password.RequireLowercase = false;
    options.Password.RequireUppercase = false;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequiredLength = 6;
    options.Password.RequiredUniqueChars = 1;
});

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"])),
            RoleClaimType = ClaimTypes.Role,
            NameClaimType = ClaimTypes.NameIdentifier
        };

        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var tokenRepo = context.HttpContext.RequestServices.GetRequiredService<ITokenRepository>();
                var token = context.HttpContext.Request.Headers["Authorization"].ToString().Replace("Bearer ", "");
                if (tokenRepo.IsTokenRevoked(token))
                {
                    context.Fail("This token has been revoked.");
                }
            }
        };

        // Cấu hình SignalR để sử dụng token từ query string
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/chatHub"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddHttpClient();
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(5);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SameSite = SameSiteMode.None;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
});

builder.Services.AddControllers();
builder.Services.AddHttpContextAccessor();
builder.Services.AddHttpClient();
builder.Services.AddSignalR();
builder.Services.Configure<AwsSettings>(builder.Configuration.GetSection("AWS"));
builder.Services.Configure<MomoOptionModel>(builder.Configuration.GetSection("MomoAPI"));
builder.Services.AddScoped<IMomoService, MoMoService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowReactApp",
        builder =>
        {
            builder.WithOrigins(
                    "http://localhost:5173",
                    "https://toysharing.asia"
                )
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials();
        });
});
var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<IdentityUser>>();
    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    var mainContext = scope.ServiceProvider.GetRequiredService<ToySharingVer3Context>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    try
    {
        var adminEmail = builder.Configuration["AdminSettings:Email"];
        var adminPassword = builder.Configuration["AdminSettings:Password"];
        var adminRole = "Admin";

        logger.LogInformation("Starting admin user creation...");

        // Tạo role Admin nếu chưa tồn tại
        if (!await roleManager.RoleExistsAsync(adminRole))
        {
            var roleResult = await roleManager.CreateAsync(new IdentityRole(adminRole));
            if (roleResult.Succeeded)
            {
                logger.LogInformation("Admin role created successfully.");
            }
            else
            {
                logger.LogError("Failed to create Admin role: {Errors}", string.Join(", ", roleResult.Errors.Select(e => e.Description)));
            }
        }

        // Tạo tài khoản Admin nếu chưa tồn tại
        var adminUser = await userManager.FindByEmailAsync(adminEmail);
        if (adminUser == null)
        {
            logger.LogInformation("Admin user not found, creating new admin user...");
            adminUser = new IdentityUser
            {
                UserName = adminEmail,
                Email = adminEmail,
                EmailConfirmed = true
            };

            var result = await userManager.CreateAsync(adminUser, adminPassword);
            if (result.Succeeded)
            {
                logger.LogInformation("Admin user created successfully.");
                var roleResult = await userManager.AddToRoleAsync(adminUser, adminRole);
                if (roleResult.Succeeded)
                {
                    logger.LogInformation("Admin user added to Admin role successfully.");
                }
                else
                {
                    logger.LogError("Failed to add Admin user to role: {Errors}", string.Join(", ", roleResult.Errors.Select(e => e.Description)));
                }
            }
            else
            {
                logger.LogError("Failed to create Admin user: {Errors}", string.Join(", ", result.Errors.Select(e => e.Description)));
            }
        }
        else
        {
            logger.LogInformation("Admin user already exists.");
        }

        // Thêm bản ghi Admin vào bảng Users trong toysharingMainDb
        var mainAdmin = await mainContext.Users
                          .FirstOrDefaultAsync(u => u.AuthUserId == Guid.Parse(adminUser.Id));
        if (mainAdmin == null)
        {
            logger.LogInformation("Adding admin user to Users table in toysharingMainDb...");
            mainAdmin = new User
            {
                AuthUserId = Guid.Parse(adminUser.Id),
                Name = adminEmail,
                CreatedAt = DateTime.Now,
                Displayname = "Administrator",
            };
            mainContext.Users.Add(mainAdmin);
            await mainContext.SaveChangesAsync();
            logger.LogInformation("Admin user added to Users table successfully.");
        }
        else
        {
            logger.LogInformation("Admin user already exists in Users table.");
        }
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "An error occurred while creating admin user.");
        throw; // Ném lại ngoại lệ để dễ debug
    }
}
// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("AllowReactApp");
app.UseSession();

app.UseHttpsRedirection();

app.UseAuthentication();

app.UseAuthorization();

app.MapControllers();

app.MapHub<ChatHub>("/chatHub");

app.Run();