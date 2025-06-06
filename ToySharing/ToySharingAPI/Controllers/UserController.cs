﻿using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using ToySharingAPI.DTO;
using ToySharingAPI.Models;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Amazon.S3;
using Amazon.Runtime;
using Amazon;
using Amazon.S3.Transfer;
using Microsoft.AspNetCore.Identity;
using System.Net.Http;
using ToySharingAPI.Service;

namespace ToySharingAPI.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UserController : ControllerBase
    {
        private readonly ToySharingVer3Context _context;
        private readonly UserManager<IdentityUser> _userManager;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly AwsSettings _awsSettings;
        private readonly IAmazonS3 _s3Client;

        public UserController(
            ToySharingVer3Context context,
            IHttpClientFactory httpClientFactory,
            IOptions<AwsSettings> awsSettings,
            UserManager<IdentityUser> userManager)
        {
            _context = context;
            _userManager = userManager;
            _httpClientFactory = httpClientFactory;
            _awsSettings = awsSettings.Value;
            var credentials = new BasicAWSCredentials(_awsSettings.AccessKey, _awsSettings.SecretKey);
            _s3Client = new AmazonS3Client(credentials, RegionEndpoint.GetBySystemName(_awsSettings.Region));
        }

        private async Task<int> GetAuthenticatedUserId()
        {
            if (!User.Identity.IsAuthenticated)
                throw new UnauthorizedAccessException("Người dùng chưa đăng nhập.");

            var authUserIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(authUserIdStr))
                throw new UnauthorizedAccessException("Không tìm thấy thông tin xác thực người dùng.");

            if (!Guid.TryParse(authUserIdStr, out Guid authUserId))
                throw new UnauthorizedAccessException("ID người dùng không hợp lệ.");

            var mainUser = await _context.Users.FirstOrDefaultAsync(u => u.AuthUserId == authUserId);
            if (mainUser == null)
                throw new UnauthorizedAccessException("Không tìm thấy người dùng trong hệ thống.");

            return mainUser.Id;
        }

        [HttpGet("current/location")]
        [Authorize]
        public async Task<IActionResult> GetCurrentUserLocation()
        {
            var mainUserId = await GetAuthenticatedUserId();
            var user = await _context.Users
                .Where(u => u.Id == mainUserId)
                .Select(u => new
                {
                    Address = u.Address,
                    Latitude = u.Latitude,
                    Longitude = u.Longtitude
                })
                .FirstOrDefaultAsync();

            if (user == null)
            {
                return NotFound("User not found.");
            }

            return Ok(user);
        }

        [HttpGet("{id}")]
        public async Task<ActionResult<UserDTO>> GetUserById(int id)
        {
            var user = await _context.Users
                .Where(u => u.Id == id)
                .Select(u => new UserDTO
                {
                    Name = u.Name,
                    DisplayName = u.Displayname,
                    Phone = u.Phone,
                    Address = u.Address,
                    Status = u.Status,
                    Avatar = u.Avatar,
                    Gender = u.Gender,
                    Age = u.Age,
                    BankName = u.BankName,
                    BankAccount = u.BankAccount,
                    BankAccountName = u.BankAccountName,
                    Rating = _context.Histories
                        .Where(h => h.Product.UserId == u.Id && h.Status == 2)
                        .Average(h => (double?)h.Rating) ?? 0,
                    CreatedAt = u.CreatedAt
                })
                .FirstOrDefaultAsync();

            if (user == null)
            {
                return NotFound();
            }

            return Ok(user);
        }

        [HttpGet("{mainUserId}/products")]
        [Authorize]
        public async Task<ActionResult<IEnumerable<ProductDTO>>> GetUserProducts()
        {
            var mainUserId = await GetAuthenticatedUserId();
            var products = await _context.Products
                .Where(p => p.UserId == mainUserId)
                .Include(p => p.Category)
                .Include(p => p.Images)
                .Select(p => new ProductDTO
                {
                    ProductId = p.ProductId,
                    UserId = p.UserId,
                    Name = p.Name,
                    CategoryName = p.Category != null ? p.Category.CategoryName : null,
                    Available = p.Available ?? 0,
                    Description = p.Description,
                    ProductStatus = p.ProductStatus,
                    Price = p.Price,
                    SuitableAge = p.SuitableAge,
                    CreatedAt = p.CreatedAt ?? DateTime.Now,
                    ImagePaths = p.Images.Select(i => i.Path).ToList()
                })
                .ToListAsync();

            return Ok(products);
        }

        [HttpGet("profile/{userId}")]
        public async Task<ActionResult<UserProfileDTO>> GetOtherUserProfile(int userId)
        {
            var userProfile = await _context.Users
                .Where(u => u.Id == userId)
                .Select(u => new UserProfileDTO
                {
                    UserInfo = new UserInfo
                    {
                        DisplayName = u.Displayname,
                        Age = u.Age,
                        Address = u.Address,
                        Avatar = u.Avatar,
                        Rating = _context.Histories
                            .Where(h => h.UserId == u.Id && h.Status == 1)
                            .Average(h => (double?)h.Rating) ?? 0
                    }
                })
                .FirstOrDefaultAsync();

            if (userProfile == null)
            {
                return NotFound();
            }

            return Ok(userProfile);
        }

        [HttpPut]
        [Authorize]
        public async Task<IActionResult> UpdateUser([FromBody] UserDTO userDto)
        {
            try
            {
                var mainUserId = await GetAuthenticatedUserId();
                var existingUser = await _context.Users.FindAsync(mainUserId);
                if (existingUser == null)
                    return NotFound("Người dùng không tồn tại.");

                // Validation
                if (string.IsNullOrWhiteSpace(userDto.DisplayName))
                    return BadRequest("Tên hiển thị là bắt buộc.");
                if (string.IsNullOrWhiteSpace(userDto.Address))
                    return BadRequest("Địa chỉ là bắt buộc.");
                if (!string.IsNullOrEmpty(userDto.BankAccount) && !System.Text.RegularExpressions.Regex.IsMatch(userDto.BankAccount, @"^\d+$"))
                    return BadRequest("Số tài khoản ngân hàng chỉ được chứa số.");

                // Update user fields
                existingUser.Name = userDto.Name;
                existingUser.Displayname = userDto.DisplayName;
                existingUser.Phone = userDto.Phone;
                existingUser.Address = userDto.Address;
                existingUser.Status = userDto.Status;
                existingUser.Avatar = userDto.Avatar;
                existingUser.Gender = userDto.Gender;
                existingUser.Age = userDto.Age;
                existingUser.BankName = userDto.BankName;
                existingUser.BankAccount = userDto.BankAccount;
                existingUser.BankAccountName = userDto.BankAccountName;
                existingUser.Latitude = userDto.Latitude;
                existingUser.Longtitude = userDto.Longitude;

                // Update Latitude and Longitude from Address if provided and coordinates are null
                if (!string.IsNullOrEmpty(userDto.Address) && (userDto.Latitude == null || userDto.Longitude == null))
                {
                    var coordinates = await GetCoordinatesFromAddressAsync(userDto.Address);
                    if (coordinates != null)
                    {
                        existingUser.Latitude = coordinates.Value.Latitude;
                        existingUser.Longtitude = coordinates.Value.Longitude;
                    }
                    else
                    {
                        return BadRequest("Không thể lấy tọa độ từ địa chỉ được cung cấp.");
                    }
                }

                await _context.SaveChangesAsync();
                return Ok(new { message = "Cập nhật thông tin người dùng thành công." });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Lỗi khi cập nhật thông tin người dùng.", error = ex.Message });
            }
        }

        [HttpPut("{mainUserId}/location")]
        [Authorize]
        public async Task<IActionResult> UpdateUserLocation([FromBody] LocationUpdateDTO locationDto)
        {
            var mainUserId = await GetAuthenticatedUserId();
            var user = await _context.Users.FindAsync(mainUserId);
            if (user == null)
            {
                return NotFound("User not found.");
            }

            if (!string.IsNullOrEmpty(locationDto.Address))
            {
                var coordinates = await GetCoordinatesFromAddressAsync(locationDto.Address);
                if (coordinates != null)
                {
                    user.Latitude = coordinates.Value.Latitude;
                    user.Longtitude = coordinates.Value.Longitude;
                    user.Address = locationDto.Address;
                }
                else
                {
                    return BadRequest("Could not retrieve coordinates from the provided address.");
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "User location updated successfully" });
        }


        [HttpGet("{id}/location")]
        public async Task<IActionResult> GetUserLocation(int id)
        {
            var user = await _context.Users
                .Where(u => u.Id == id)
                .Select(u => new
                {
                    Address = u.Address,
                    Latitude = u.Latitude,
                    Longitude = u.Longtitude
                })
                .FirstOrDefaultAsync();

            if (user == null)
            {
                return NotFound("User not found.");
            }

            return Ok(user);
        }

        // Calculate Distance to Product Owner (dùng Haversine thay vì Google Maps)
        [HttpGet("distance-to-product/{productId}")]
        public async Task<IActionResult> CalculateDistanceToProduct(int productId, decimal myLatitude, decimal myLongitude)
        {
            var product = await _context.Products
                .Include(p => p.User)
                .FirstOrDefaultAsync(p => p.ProductId == productId);

            if (product == null)
            {
                return NotFound("Product not found.");
            }

            var owner = product.User;
            if (owner == null || !owner.Latitude.HasValue || !owner.Longtitude.HasValue)
            {
                return BadRequest("Owner location is not available.");
            }

            var ownerLatitude = owner.Latitude.Value;
            var ownerLongitude = owner.Longtitude.Value;

            // Tính khoảng cách bằng công thức Haversine
            double distance = CalculateHaversineDistance(myLatitude, myLongitude, ownerLatitude, ownerLongitude);

            return Ok(new
            {
                DistanceKilometers = distance,
                DistanceText = $"{distance:F2} km"
            });
        }


        [HttpPost("ban")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> BanUser([FromBody] BanUnbanRequestDTO request)
        {
            var user = await _context.Users.FindAsync(request.UserId);
            if (user == null)
                return NotFound("User not found");

            user.Status = 1;
            await _context.SaveChangesAsync();

            var banLog = new BanLog
            {
                UserId = request.UserId,
                Reason = request.Reason,
                Timestamp = DateTime.Now
            };

            _context.BanLogs.Add(banLog);
            await _context.SaveChangesAsync();

            return Ok("User banned successfully");
        }

        [HttpPost("unban")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> UnbanUser([FromBody] BanUnbanRequestDTO request)
        {
            var user = await _context.Users.FindAsync(request.UserId);
            if (user == null)
                return NotFound("User not found");

            user.Status = 0;
            await _context.SaveChangesAsync();

            var banLog = new BanLog
            {
                UserId = request.UserId,
                Reason = request.Reason,
                Timestamp = DateTime.Now
            };

            _context.BanLogs.Add(banLog);
            await _context.SaveChangesAsync();

            return Ok("User unbanned successfully");
        }

        [HttpGet("ban-history")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> GetAllBanHistory()
        {
            var logs = await _context.BanLogs
                .Select(log => new BanLogDTO
                {
                    UserId = log.UserId,
                    Reasons = log.Reason,
                    Timestamp = log.Timestamp ?? DateTime.MinValue
                })
                .ToListAsync();

            return Ok(logs);
        }

        [HttpPost("upload-avatar")]
        [Authorize]
        public async Task<IActionResult> UploadAvatar(IFormFile file)
        {
            var mainUserId = await GetAuthenticatedUserId();
            var user = await _context.Users.FindAsync(mainUserId);
            if (user == null)
                return NotFound("Không tìm thấy người dùng.");

            if (file == null || file.Length == 0)
                return BadRequest("Không có file được tải lên.");

            var imageUrl = await UploadImageToS3(file);
            user.Avatar = imageUrl;
            await _context.SaveChangesAsync();

            return Ok(new { avatarUrl = imageUrl });
        }

        [HttpGet("role/user")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> GetAllUsersWithUserRole()
        {
            try
            {
                var currentUserId = await GetAuthenticatedUserId();
                var identityUsers = await _userManager.Users.ToListAsync();
                var result = new List<ListUserDTO>();

                foreach (var identityUser in identityUsers)
                {
                    if (Guid.TryParse(identityUser.Id, out Guid authUserGuid))
                    {
                        var mainUser = await _context.Users
                            .FirstOrDefaultAsync(u => u.AuthUserId == authUserGuid);

                        if (mainUser != null && mainUser.Id != currentUserId)
                        {
                            var roles = await _userManager.GetRolesAsync(identityUser);
                            var roleStr = roles.FirstOrDefault() ?? string.Empty;
                            result.Add(new ListUserDTO
                            {
                                Id = mainUser.Id,
                                Email = mainUser.Name,
                                DisplayName = mainUser.Displayname,
                                Gender = mainUser.Gender,
                                Status = mainUser.Status,
                                Role = roleStr,
                                CreatedAt = mainUser.CreatedAt
                            });
                        }
                    }
                }

                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = $"Lỗi server: {ex.Message}" });
            }
        }

        private async Task<(decimal Latitude, decimal Longitude)?> GetCoordinatesFromAddressAsync(string address)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                var encodedAddress = Uri.EscapeDataString(address);
                var url = $"https://nominatim.openstreetmap.org/search?q={encodedAddress}&format=jsonv2";
                client.DefaultRequestHeaders.Add("User-Agent", "ToySharingAPI");
                var response = await client.GetStringAsync(url);
                var json = JsonSerializer.Deserialize<JsonElement>(response);

                if (json.ValueKind == JsonValueKind.Array && json.GetArrayLength() > 0)
                {
                    var firstResult = json[0];
                    if (firstResult.TryGetProperty("lat", out var latProp) && firstResult.TryGetProperty("lon", out var lonProp))
                    {
                        decimal latitude = decimal.Parse(latProp.GetString());
                        decimal longitude = decimal.Parse(lonProp.GetString());
                        return (latitude, longitude);
                    }
                }
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error in GetCoordinatesFromAddressAsync: {ex.Message}");
                return null;
            }
        }

        private async Task<string> GetAddressFromCoordinatesAsync(decimal latitude, decimal longitude)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                var url = $"https://nominatim.openstreetmap.org/reverse?lat={latitude}&lon={longitude}&format=jsonv2";
                client.DefaultRequestHeaders.Add("User-Agent", "ToySharingAPI");
                var response = await client.GetStringAsync(url);
                var json = JsonSerializer.Deserialize<JsonElement>(response);

                if (json.TryGetProperty("display_name", out var displayNameProp))
                {
                    return displayNameProp.GetString();
                }
                return null;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Lỗi trong GetAddressFromCoordinatesAsync: {ex.Message}");
                return null;
            }
        }

        private async Task<string> UploadImageToS3(IFormFile file)
        {
            var fileName = Guid.NewGuid().ToString() + Path.GetExtension(file.FileName);
            var key = $"avatars/{fileName}";
            var uploadRequest = new TransferUtilityUploadRequest
            {
                InputStream = file.OpenReadStream(),
                Key = key,
                BucketName = _awsSettings.BucketName,
                ContentType = file.ContentType
            };

            var transferUtility = new TransferUtility(_s3Client);
            await transferUtility.UploadAsync(uploadRequest);

            return $"https://{_awsSettings.BucketName}.s3.{_awsSettings.Region}.amazonaws.com/{key}";
        }
        // Công thức Haversine tính khoảng cách (km)
        private double CalculateHaversineDistance(decimal lat1, decimal lon1, decimal lat2, decimal lon2)
        {
            const double R = 6371; // Bán kính Trái Đất (km)
            double dLat = ToRadians((double)(lat2 - lat1));
            double dLon = ToRadians((double)(lon2 - lon1));
            double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                       Math.Cos(ToRadians((double)lat1)) * Math.Cos(ToRadians((double)lat2)) *
                       Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            double c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
            return R * c;
        }

        private double ToRadians(double degrees)
        {
            return degrees * Math.PI / 180;
        }

    }
}