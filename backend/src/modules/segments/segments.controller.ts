import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { SegmentResponseDto } from './dto/segment-response.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import { SegmentsService } from './segments.service';

@ApiTags('segments')
@Controller('segments')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create segment' })
  @ApiCreatedResponse({ type: SegmentResponseDto })
  create(
    @Body() createSegmentDto: CreateSegmentDto,
  ): Promise<SegmentResponseDto> {
    return this.segmentsService.create(createSegmentDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all segments' })
  @ApiOkResponse({ type: SegmentResponseDto, isArray: true })
  findAll(): Promise<SegmentResponseDto[]> {
    return this.segmentsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get segment by id' })
  @ApiOkResponse({ type: SegmentResponseDto })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SegmentResponseDto> {
    return this.segmentsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update segment metadata and rules' })
  @ApiOkResponse({ type: SegmentResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSegmentDto: UpdateSegmentDto,
  ): Promise<SegmentResponseDto> {
    return this.segmentsService.update(id, updateSegmentDto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete segment (soft delete)' })
  @ApiNoContentResponse()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.segmentsService.remove(id);
  }
}
