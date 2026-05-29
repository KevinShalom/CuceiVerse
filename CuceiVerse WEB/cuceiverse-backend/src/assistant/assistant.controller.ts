import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AssistantService } from './assistant.service';
import { AssistantChatDto } from './dto/assistant-chat.dto';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
    siiauCode: string;
  };
};

@Controller('assistant')
@UseGuards(AuthGuard('jwt'))
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post('chat')
  async chat(@Req() req: AuthenticatedRequest, @Body() dto: AssistantChatDto) {
    return this.assistantService.chat(
      { id: req.user.id, siiauCode: req.user.siiauCode },
      dto,
    );
  }
}
