# .NET Backend Workflow

## Thêm API Endpoint mới

### 1. Tạo/update DTOs
File: `backend/Models/{Feature}Dtos.cs`
```csharp
namespace Mindlex.Models;
public record MyRequest(string Field1, int Field2);
```

### 2. Thêm endpoint vào Controller
File: `backend/Controllers/{Feature}Controller.cs`

Pattern chuẩn:
```csharp
[HttpPost("action")]
public async Task<IActionResult> MyAction([FromBody] MyRequest req, CancellationToken ct)
{
    var userId = CurrentUserId;
    if (userId is null) return Unauthorized();

    // Role check nếu cần feature gating
    var roleNames = (await _roles.GetUserRolesAsync(userId.Value, ct)).Select(r => r.Name).ToList();
    var allowed = roleNames.Any(r => string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase));
    if (!allowed) return StatusCode(StatusCodes.Status403Forbidden, new { error = "...", code = "..." });

    // Business logic
    // ...

    return Ok(new { field1 = "value" });
}
```

### 3. Register services (nếu cần)
File: `backend/Program.cs`
```csharp
builder.Services.AddScoped<IMyService, MyService>();
```

## Thêm Database Entity

### 1. Define entity trong `Data/MindlexDbContext.cs`
```csharp
public sealed class MyEntity
{
    public Guid Id { get; set; }
    // ...
}
```

### 2. Thêm DbSet
```csharp
public DbSet<MyEntity> MyEntities => Set<MyEntity>();
```

### 3. Configure trong `OnModelCreating`
```csharp
b.Entity<MyEntity>(e =>
{
    e.HasKey(x => x.Id);
    e.HasIndex(x => x.SomeField);
    // ...
});
```

### 4. Tạo migration
```bash
cd backend && dotnet ef migrations add AddMyEntity --context MindlexDbContext --output-dir Migrations/Mindlex
```

### 5. Apply
```bash
cd backend && dotnet ef database update --context MindlexDbContext
```

## Build & Verify

```bash
cd backend && dotnet build
```

## Lưu ý quan trọng

- **KHÔNG** touch DainnUser/DainnStripe migrations — chúng bị lỗi, dùng EnsureCreated
- **KHÔNG** tạo migration cho DainnUserDbContext hoặc DainnStripeDbContext
- **Nếu gặp lỗi từ DainnUser hoặc DainnStripe → KHÔNG cố sửa.** Tạo task/note mô tả lỗi để team upstream (DainnUser/DainnStripe) xử lý. Workaround nếu cần, nhưng không modify source của libraries.
- Config values đọc từ `appsettings.json` section `Mindlex:*`
- Activity logging dùng `IActivityService` cho audit trail
- Error responses luôn có shape `{ error: string, code?: string }`
